/**
 * Post-confirm asset-changes extractor.
 *
 * Decodes ERC-20 Transfer logs from a confirmed tx receipt, filters them to
 * transfers where the user wallet is `from` or `to`, and computes the pure
 * native-value flow for that wallet via two `eth_getBalance` calls (one at
 * blockNumber-1, one at blockNumber, then gasCost added back).
 *
 * Used by:
 *   - `txReceiptPoller.applyReceiptToHistory` after a source-tx success →
 *     writes `assetChanges` onto the existing tx-history entry.
 *   - `bridgeStatusPoller.checkAndApplyStatus` once Bungee surfaces a
 *     destination tx-hash → fetches that receipt off the dest-chain RPC and
 *     writes `destAssetChanges`.
 *
 * Both paths are fire-and-forget — a failure here must never block the
 * confirmation notification or the bridge state machine.
 */

import { resolveTokenMetadata } from "./tokenMetadata";
import { getRpcUrl } from "./txHandlers";
import { updateTxInHistory, type AssetChangeRecord, type AssetTransferRecord } from "./txHistoryStorage";
import { addReceivedToken } from "./recentlyReceivedTokens";

/**
 * keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer signature.
 * ERC-721 reuses the same topic but adds a 4th (indexed tokenId) topic; we
 * differentiate by `topics.length === 3` so NFT logs are skipped naturally.
 */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Lag-tolerant retry config for the historical-balance RPC. */
const BALANCE_RETRY_ATTEMPTS = 3;
const BALANCE_RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Coercion: receipts come in two shapes — raw RPC (hex strings) from the
// poll path, and viem-formatted (bigints + "success"/"reverted") from the
// sync-send / EIP-7966 path. Helpers normalize to bigint.
// ---------------------------------------------------------------------------

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return 0n;
}

function topicToAddress(topic: string): string {
  // Topics are 32-byte big-endian — an address occupies the last 20 bytes.
  return ("0x" + topic.slice(-40)).toLowerCase();
}

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

async function fetchBalanceAtBlock(
  rpcUrl: string,
  address: string,
  blockHex: string,
): Promise<bigint | null> {
  for (let attempt = 0; attempt < BALANCE_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await rpcCall(rpcUrl, "eth_getBalance", [
        address,
        blockHex,
      ]);
      if (typeof result === "string") return BigInt(result);
    } catch {
      // RPC may not yet know about the block (load-balanced node lag) —
      // back off and retry. After the last attempt we return null and the
      // caller stores `nativeDelta: undefined`.
    }
    if (attempt < BALANCE_RETRY_ATTEMPTS - 1) {
      await sleep(BALANCE_RETRY_DELAY_MS);
    }
  }
  return null;
}

async function fetchReceiptRaw(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  try {
    const result = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    return result || null;
  } catch {
    return null;
  }
}

/**
 * When the sender posts multiple txs in the same block, `bal(N) - bal(N-1)`
 * lumps every tx's debit together. Adding back just THIS tx's gas leaves the
 * sibling txs' costs polluting the result (e.g. a pure ERC-20 approve looks
 * like a phantom −2.3 µETH outflow because a later approve in the same block
 * also debited the sender). This helper sums every sibling tx's
 * `value + gasUsed * effectiveGasPrice + l1Fee` so the caller can add it
 * back. Approximation: assumes siblings don't internally receive native back
 * to the sender (true for the vast majority of approves / transfers / swaps —
 * the user would just see no native row in the rare unwrap-then-sibling case).
 */
async function sumSiblingSenderTxCosts(
  rpcUrl: string,
  blockNumberHex: string,
  sender: string,
  ourTxHash: string,
): Promise<bigint> {
  let block: any;
  try {
    block = await rpcCall(rpcUrl, "eth_getBlockByNumber", [blockNumberHex, true]);
  } catch {
    return 0n;
  }
  const txs: any[] = Array.isArray(block?.transactions) ? block.transactions : [];
  const senderLower = sender.toLowerCase();
  const ourHashLower = ourTxHash.toLowerCase();
  const siblings = txs.filter(
    (t) =>
      typeof t?.from === "string" &&
      t.from.toLowerCase() === senderLower &&
      typeof t?.hash === "string" &&
      t.hash.toLowerCase() !== ourHashLower,
  );
  if (siblings.length === 0) return 0n;

  let total = 0n;
  await Promise.all(
    siblings.map(async (sibTx) => {
      const valueWei = (() => {
        try {
          return BigInt(sibTx.value ?? "0x0");
        } catch {
          return 0n;
        }
      })();
      const sibReceipt = await fetchReceiptRaw(rpcUrl, sibTx.hash);
      if (!sibReceipt) {
        total += valueWei;
        return;
      }
      try {
        const gasUsed = toBigInt(sibReceipt.gasUsed);
        const effectiveGasPrice = toBigInt(sibReceipt.effectiveGasPrice);
        const l1Fee = sibReceipt.l1Fee ? toBigInt(sibReceipt.l1Fee) : 0n;
        total += valueWei + gasUsed * effectiveGasPrice + l1Fee;
      } catch {
        total += valueWei;
      }
    }),
  );
  return total;
}

// ---------------------------------------------------------------------------
// Core extraction
// ---------------------------------------------------------------------------

interface ExtractInput {
  receipt: any;
  userAddress: string;
  chainId: number;
  rpcUrl: string;
  /**
   * When true, also subtract the tx's gas cost from `bal(N) - bal(N-1)` so
   * `nativeDelta` reflects only the actual value flow. False for receivers
   * of a bridge dest-leg (they didn't pay gas).
   */
  payerForGas: boolean;
}

async function extractFromReceipt({
  receipt,
  userAddress,
  chainId,
  rpcUrl,
  payerForGas,
}: ExtractInput): Promise<AssetChangeRecord | null> {
  const userLower = userAddress.toLowerCase();
  const blockNumberBI = toBigInt(receipt.blockNumber);
  if (blockNumberBI === 0n) return null;
  const blockNumber = blockNumberBI.toString();

  // --- ERC-20 transfers involving the user ----------------------------------
  const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transferDrafts: Array<{
    token: string;
    direction: "in" | "out";
    counterparty: string;
    amountWei: string;
  }> = [];
  for (const log of logs) {
    const topics: string[] = log?.topics ?? [];
    if (topics.length !== 3) continue; // skip non-Transfer or ERC-721 (4 topics)
    if (typeof topics[0] !== "string") continue;
    if (topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = topicToAddress(topics[1]);
    const to = topicToAddress(topics[2]);
    const isOut = from === userLower;
    const isIn = to === userLower;
    if (!isOut && !isIn) continue;
    if (isOut && isIn) {
      // Self-transfer: still surface, mark as "out" (counterparty is self).
    }
    let amountWei = 0n;
    try {
      amountWei = BigInt(log.data ?? "0x0");
    } catch {
      continue;
    }
    if (amountWei === 0n) continue;
    const token = String(log.address ?? "").toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) continue;
    transferDrafts.push({
      token,
      direction: isOut ? "out" : "in",
      counterparty: isOut ? to : from,
      amountWei: amountWei.toString(),
    });
  }

  // --- Resolve symbol / decimals / logo per unique token --------------------
  const uniqueTokens = Array.from(new Set(transferDrafts.map((t) => t.token)));
  const metaByToken = new Map<
    string,
    { name?: string; symbol?: string; decimals?: number; logoUrl?: string }
  >();
  await Promise.all(
    uniqueTokens.map(async (addr) => {
      metaByToken.set(
        addr,
        await resolveTokenMetadata(chainId, addr).catch(() => ({})),
      );
    }),
  );

  const erc20Transfers: AssetTransferRecord[] = transferDrafts.map((draft) => {
    const meta = metaByToken.get(draft.token);
    return {
      ...draft,
      symbol: meta?.symbol,
      decimals: meta?.decimals,
      logoUrl: meta?.logoUrl,
    };
  });

  // --- Native value flow ----------------------------------------------------
  const blockHexCurrent = "0x" + blockNumberBI.toString(16);
  const blockHexPrev = "0x" + (blockNumberBI - 1n).toString(16);
  const [balCurrent, balPrev] = await Promise.all([
    fetchBalanceAtBlock(rpcUrl, userAddress, blockHexCurrent),
    fetchBalanceAtBlock(rpcUrl, userAddress, blockHexPrev),
  ]);

  let nativeDelta: string | undefined;
  if (balCurrent !== null && balPrev !== null) {
    let pureFlow = balCurrent - balPrev;
    if (payerForGas) {
      try {
        const gasUsed = toBigInt(receipt.gasUsed);
        const effectiveGasPrice = toBigInt(receipt.effectiveGasPrice);
        const l1Fee = receipt.l1Fee ? toBigInt(receipt.l1Fee) : 0n;
        pureFlow += gasUsed * effectiveGasPrice + l1Fee;
      } catch {
        // If gas fields are missing/malformed, leave `pureFlow` as-is —
        // the row still reflects "what changed on chain for me" which is
        // a useful signal even if it includes gas.
      }
      // Compensate for the sender's OTHER txs in the same block: their
      // debits also appear in `bal(N) - bal(N-1)` and would otherwise be
      // wrongly attributed to this tx. We add their total cost back so
      // `pureFlow` reflects only this tx's impact on the sender.
      const ourHash: string | undefined = receipt.transactionHash;
      if (ourHash) {
        const siblingCost = await sumSiblingSenderTxCosts(
          rpcUrl,
          blockHexCurrent,
          userAddress,
          ourHash,
        );
        pureFlow += siblingCost;
      }
    }
    if (pureFlow !== 0n) {
      nativeDelta = pureFlow.toString();
    }
  }

  // Nothing to show: no transfers + no native delta. Skip writing entirely
  // so the modal section just stays hidden.
  if (erc20Transfers.length === 0 && nativeDelta === undefined) return null;

  return {
    blockNumber,
    nativeDelta,
    erc20Transfers,
  };
}

// ---------------------------------------------------------------------------
// Public entry points — one per write target
// ---------------------------------------------------------------------------

export interface SourceExtractionArgs {
  txId: string;
  chainId: number;
  userAddress: string;
  receipt: any;
  rpcUrl: string;
}

/**
 * Source-tx path: receipt already in hand from `applyReceiptToHistory`.
 * Writes `assetChanges` on the tx-history entry and seeds the recent-receipts
 * cache for any incoming tokens so the portfolio loader can inject them.
 */
export async function extractAndStoreAssetChanges(
  args: SourceExtractionArgs,
): Promise<void> {
  try {
    const record = await extractFromReceipt({
      receipt: args.receipt,
      userAddress: args.userAddress,
      chainId: args.chainId,
      rpcUrl: args.rpcUrl,
      payerForGas: true,
    });
    if (!record) return;
    await seedRecentlyReceivedSafely(args.chainId, record);
    await updateTxInHistory(args.txId, { assetChanges: record });
  } catch (err) {
    console.warn("[assetChanges] source extraction failed", err);
  }
}

export interface DestinationExtractionArgs {
  txId: string;
  destChainId: number;
  destTxHash: string;
  receiverAddress: string;
}

/**
 * Bridge destination path: only the dest tx-hash + dest chainId are in hand
 * (the bridge poller doesn't broker the receipt). Resolves the dest RPC,
 * fetches the receipt, extracts inbound transfers + native delta for the
 * receiver, and writes `destAssetChanges`.
 */
export async function extractAndStoreDestinationAssetChanges(
  args: DestinationExtractionArgs,
): Promise<void> {
  try {
    const rpcUrl = await getRpcUrl(args.destChainId);
    if (!rpcUrl) return;
    const receipt = await fetchReceiptRaw(rpcUrl, args.destTxHash);
    if (!receipt) return;
    const record = await extractFromReceipt({
      receipt,
      userAddress: args.receiverAddress,
      chainId: args.destChainId,
      rpcUrl,
      payerForGas: false,
    });
    if (!record) return;
    await seedRecentlyReceivedSafely(args.destChainId, record);
    await updateTxInHistory(args.txId, { destAssetChanges: record });
  } catch (err) {
    console.warn("[assetChanges] destination extraction failed", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedRecentlyReceived(
  chainId: number,
  record: AssetChangeRecord,
): Promise<void> {
  for (const transfer of record.erc20Transfers) {
    if (transfer.direction !== "in") continue;
    // Pass through the metadata we already resolved during extraction so the
    // portfolio loader can render the token's symbol/logo immediately without
    // waiting on another token-metadata round-trip.
    await addReceivedToken(chainId, transfer.token, {
      symbol: transfer.symbol,
      decimals: transfer.decimals,
      logoUrl: transfer.logoUrl,
    });
  }
}

async function seedRecentlyReceivedSafely(
  chainId: number,
  record: AssetChangeRecord,
): Promise<void> {
  try {
    await seedRecentlyReceived(chainId, record);
  } catch (err) {
    console.warn("[assetChanges] recent received token seed failed", err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
