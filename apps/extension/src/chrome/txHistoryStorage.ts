/**
 * Transaction History Storage
 * Stores completed (processing/success/failed) transactions persistently
 */

import { TransactionParams } from "./bankrApi";
import type { Erc7715PermissionRevokeMeta } from "./pendingTxStorage";
import { withStorageLock } from "./storageLock";

export type TxStatus = "processing" | "pending" | "success" | "failed";

export interface SwapMeta {
  sellTokenSymbol: string;
  sellTokenLogo: string | null;
  buyTokenSymbol: string;
  buyTokenLogo: string | null;
}

export interface TransferMeta {
  recipient: string;
  amount: string;
  symbol: string;
  tokenLogo: string | null;
}

/**
 * Snapshot of clear-signed decoded data captured at submission time so the
 * Activity tab can render "Approved 100 USDC to Uniswap V3 Router" without
 * re-running the decoders, RPC reads, or eth.sh / ENS lookups on every
 * render. Optional — when missing the row falls back to the raw functionName.
 *
 * Kinds:
 *   "approve"    — ERC-20 approve(spender, amount). spender = counterparty.
 *   "transfer"   — ERC-20 transfer(recipient, amount). recipient = counterparty.
 *   "nativeSend" — empty calldata + value > 0. tx.to = counterparty.
 *   "erc7730"    — an ERC-7730 descriptor matched the call; intent +
 *                  contractName captured. tx.to = counterparty (the contract).
 */
export interface ClearSignedMeta {
  kind: "approve" | "transfer" | "nativeSend" | "erc7730";
  /** Formatted decimal string (post-formatUnits). Omitted for erc7730. */
  amount?: string;
  /** Token / native symbol (e.g., "USDC", "ETH"). Omitted for erc7730. */
  tokenSymbol?: string;
  /** Token logo URL from the centralized token metadata resolver. */
  tokenLogo?: string | null;
  /** ERC-20 token contract address (approve/transfer only). */
  tokenAddress?: string;
  /** Approve only — true when amount >= 2^128 (treated as unlimited). */
  isInfinite?: boolean;
  /** Approve only — true when amount === 0 (revoking an existing allowance). */
  isRevoke?: boolean;
  /** Spender / recipient / contract address (the thing the user is "sending to"). */
  counterparty?: string;
  /** First eth.sh label for counterparty, if any (e.g., "Uniswap V3 Router"). */
  counterpartyLabel?: string;
  /** Reverse-resolved ENS / Basename / WNS / GNS for counterparty, if any. */
  counterpartyEns?: string;
  /** ERC-7730 only — descriptor's `display.formats[x].intent`. */
  intent?: string;
  /** ERC-7730 only — descriptor's `metadata.contractName`. */
  contractName?: string;
}

/** Metadata for force-inclusion (OP Stack L1 deposit) transactions */
export interface ForceInclusionMeta {
  /** L1 transaction hash (the deposit tx on Ethereum/Sepolia) */
  l1TxHash: string;
  /** L1 chain ID (1 for mainnet, 11155111 for Sepolia) */
  l1ChainId: number;
  /** L2 chain ID (the original target chain, e.g. Base) */
  l2ChainId: number;
  /** Whether the L2 tx has been confirmed by the sequencer */
  l2Confirmed?: boolean;
}

/**
 * One ERC-20 transfer log involving the user, decoded from the confirmed
 * tx receipt. We only retain transfers where the user wallet is `from` or
 * `to` (logs that are pure internal routing through DEX pools are dropped),
 * so the modal can render a clean "what flowed in / out of my wallet" view.
 *
 * Fields are optional where metadata may arrive after the first write —
 * `symbol/decimals/logoUrl` are filled in by the token metadata resolver,
 * and may be undefined until that resolves.
 */
export interface AssetTransferRecord {
  /** Token contract address (lowercased). */
  token: string;
  direction: "in" | "out";
  /** The other side of the transfer (lowercased). */
  counterparty: string;
  /** Raw amount in base units (decimal string). */
  amountWei: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

/**
 * Snapshot of the asset changes a confirmed tx produced for the sender.
 * Populated by `assetChangesExtractor` immediately after `applyReceiptToHistory`
 * lands a success. Optional — only present on confirmed txs; failed and
 * pre-existing entries simply lack it and the modal renders without the
 * "Token Changes" section.
 */
export interface AssetChangeRecord {
  /** Block number the tx mined into (decimal string). */
  blockNumber: string;
  /**
   * Signed pure native value flow in wei (`balance(N) - balance(N-1) + gasCost`).
   * Positive = net received, negative = net sent. Undefined when the RPC
   * couldn't resolve `balance(N-1)` after retries — the modal then hides the
   * native row but still renders the ERC-20 rows.
   */
  nativeDelta?: string;
  erc20Transfers: AssetTransferRecord[];
}

/**
 * Metadata for cross-chain bridge txs. Present on the **source-chain** tx-
 * history entry. The source tx itself confirms via the normal receipt poller;
 * once it does, `bridgeStatusPoller` polls Socket's status endpoint and
 * updates `destinationTxHash` + `bungeeStatusCode` here when the destination
 * leg lands. Optional — only present on bridge entries.
 */
export interface BridgeMeta {
  /** Socket quoteId, kept under the legacy requestHash field name. */
  requestHash?: string;
  /** Source chain (same as the parent CompletedTransaction.chainId). */
  sourceChainId: number;
  /** Source tx hash (same as the parent CompletedTransaction.txHash). */
  sourceTxHash?: string;
  /** Destination chain the user is bridging to. */
  destinationChainId: number;
  destinationChainName: string;
  /** Destination tx hash, populated once Bungee fulfills the request. */
  destinationTxHash?: string;
  /** Latest mapped bridge status code seen for this request. */
  bungeeStatusCode?: number;
  /** Socket route name (e.g. "Across"). Cosmetic. */
  routeName?: string;
  /** Destination receiver address. Defaults to source `from` when omitted. */
  receiverAddress?: string;
  /** Refund tx hash if Bungee REFUNDED the request on the source chain. */
  refundTxHash?: string;
}

export interface TxCallOrigin {
  origin: string;
  favicon: string | null;
}

export interface CompletedTransaction {
  id: string;
  status: TxStatus;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  chainId: number;
  createdAt: number;
  completedAt?: number;
  txHash?: string;
  error?: string;
  jobId?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase";
  functionName?: string;
  gasData?: GasData;
  swapMeta?: SwapMeta;
  transferMeta?: TransferMeta;
  clearSignedMeta?: ClearSignedMeta;
  /**
   * Per-call dapp identity for decoded ERC-7821 batch history entries.
   * Cross-dapp batches populate one item per encoded call so the Activity
   * details modal can show each contributing dapp instead of the synthetic
   * batch-level origin. Optional; old entries fall back to `origin/favicon`.
   */
  batchCallOrigins?: TxCallOrigin[];
  forceInclusionMeta?: ForceInclusionMeta;
  /** Cross-chain bridge metadata. Present only on bridge txs. */
  bridge?: BridgeMeta;
  /**
   * Post-confirm snapshot of ERC-20 + native flows for the sender. Written by
   * `assetChangesExtractor` once the receipt lands. The activity-tab modal
   * renders it as the "Token Changes" section. Absent on failed / pre-existing
   * entries — consumers must render conditionally.
   */
  assetChanges?: AssetChangeRecord;
  /**
   * Bridge destination leg: same shape, computed against the destination
   * chain RPC after Bungee writes `bridge.destinationTxHash`. Receiver is
   * the bridge's `receiverAddress` (defaults to source `from`).
   */
  destAssetChanges?: AssetChangeRecord;
  // Set on tx-history entries that are one slice of a user-split
  // wallet_sendCalls bundle. Used by the receipt poller and rejection
  // paths to advance the parent bundle's split sequencer.
  parentBundleId?: string;
  bundleIndex?: number;
  /**
   * EIP-7702 delegation metadata, captured at confirm-click time. Present on
   * standalone Set / Revoke txs (the self-call where the actual effect lives
   * in the authorization tuple, not in `tx.data`). Lets `TxDetailModal` show
   * the target contract — without it the activity entry looks like a no-op
   * self-call and the user can't tell what they delegated to.
   */
  delegation7702Meta?: {
    targetDelegate: `0x${string}`;
    kind: "revoke" | "setDelegate";
  };
  /**
   * ERC-7715 permission grant disable tx. Present on WalletChan-queued
   * DelegationManager `disableDelegation` transactions so the receipt path can
   * mark the grant locally revoked only after the onchain tx succeeds. Extra
   * fields are public display snapshots copied from the pending request for
   * activity/history readability.
   */
  erc7715PermissionRevokeMeta?: Erc7715PermissionRevokeMeta;
  /**
   * Account ID this tx was signed by. Captured at addTxToHistory time so
   * post-confirm hooks (e.g., the `customDelegates` mirror in
   * `applyReceiptToHistory`) can resolve the right account without falling
   * back to address-based lookups that could collide if the same EOA is
   * imported under multiple account entries.
   *
   * Optional and additive — pre-existing entries lack it; consumers must
   * gate on its presence.
   */
  accountId?: string;
}

export interface GasData {
  gasUsed: string;           // decimal string
  gasLimit: string;          // decimal string
  effectiveGasPrice: string; // decimal string (wei)
  // OP Stack L2 only
  l1Fee?: string;            // decimal string (wei)
  l1GasUsed?: string;        // decimal string
  l1GasPrice?: string;       // decimal string (wei)
}

const TX_HISTORY_KEY = "txHistory";
const MAX_HISTORY_SIZE = 50;

/**
 * Module-level serializer for tx history writes.
 *
 * `addTxToHistory` and `updateTxInHistory` both follow a read-modify-write
 * pattern on the same chrome.storage key. Without serialization, two
 * concurrent updaters race:
 *
 *   T0 (approve receipt resolves):  read history (both processing)
 *   T0 (swap receipt resolves):     read history (both processing)
 *   T1 (approve):                   write { approve: pending, swap: processing }
 *   T2 (swap):                      write { approve: processing, swap: pending }
 *
 * Whichever writer runs second clobbers the first writer's update. Symptom
 * we hit in production: in a non-atomic batch force inclusion, one sub-tx
 * transitions to "L1 Confirmed / L2 Pending" but the other stays stuck on
 * "L1 Pending" forever — even though both L1 receipts are actually onchain.
 *
 * This mutex serializes ALL writes to TX_HISTORY_KEY so each read-modify-write
 * is atomic from the perspective of the in-process callers. (Multi-process
 * concurrency isn't a concern: chrome.storage in MV3 is only written by the
 * service worker.)
 */
const TX_HISTORY_LOCK_KEY = `local:${TX_HISTORY_KEY}`;

/**
 * Get all transaction history (newest first)
 */
export async function getTxHistory(): Promise<CompletedTransaction[]> {
  const data = await chrome.storage.local.get(TX_HISTORY_KEY);
  return data[TX_HISTORY_KEY] || [];
}

/**
 * Add a new transaction to history
 */
export async function addTxToHistory(tx: CompletedTransaction): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();

    // Add at beginning (newest first)
    history.unshift(tx);

    // Trim to max size
    const trimmed = history.slice(0, MAX_HISTORY_SIZE);

    await chrome.storage.local.set({ [TX_HISTORY_KEY]: trimmed });

    // Notify open views about update
    chrome.runtime
      .sendMessage({ type: "txHistoryUpdated", updatedTx: tx })
      .catch(() => {
        // Ignore errors if no listeners
      });
  });
}

/**
 * Update an existing transaction in history
 */
export async function updateTxInHistory(
  txId: string,
  updates: Partial<CompletedTransaction>
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const index = history.findIndex((tx) => tx.id === txId);

    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: history });

      // Notify open views
      chrome.runtime
        .sendMessage({
          type: "txHistoryUpdated",
          updatedTx: history[index],
          changedKeys: Object.keys(updates),
        })
        .catch(() => {
          // Ignore errors if no listeners
        });
    }
  });
}

/**
 * Get a single transaction by ID
 */
export async function getTxById(
  txId: string
): Promise<CompletedTransaction | null> {
  const history = await getTxHistory();
  return history.find((tx) => tx.id === txId) || null;
}

/**
 * Get only processing transactions
 */
export async function getProcessingTxs(): Promise<CompletedTransaction[]> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "processing");
}

/**
 * Get transactions awaiting onchain confirmation (have txHash but not yet confirmed)
 */
export async function getPendingConfirmationTxs(): Promise<
  CompletedTransaction[]
> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "pending" && tx.txHash);
}

/**
 * Mark any txs stuck in "processing" for longer than the threshold as failed.
 * This handles edge cases like service worker restart mid-processing.
 *
 * Force inclusion txs are intentionally skipped — they can legitimately stay
 * in "processing" for the full L1 wait window (up to L1_RECEIPT_TIMEOUT, ~10
 * min). recoverStuckForceInclusionTxs() handles them by re-fetching the L1
 * receipt directly instead of timing out blindly.
 */
export async function cleanupStaleProcessingTxs(
  maxAgeMs: number = 5 * 60 * 1000,
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const now = Date.now();
    let changed = false;

    for (const tx of history) {
      if (tx.forceInclusionMeta) continue; // recovery handles these
      if (tx.status === "processing" && now - tx.createdAt > maxAgeMs) {
        tx.status = "failed";
        tx.error = "Transaction timed out";
        tx.completedAt = now;
        changed = true;
      }
    }

    if (changed) {
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: history });
      chrome.runtime
        .sendMessage({ type: "txHistoryUpdated" })
        .catch(() => {});
    }
  });
}

/**
 * Clear all transaction history
 */
export async function clearTxHistory(): Promise<void> {
  await withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    await chrome.storage.local.remove(TX_HISTORY_KEY);
  });

  // Notify open views
  chrome.runtime.sendMessage({ type: "txHistoryUpdated" }).catch(() => {
    // Ignore errors if no listeners
  });
}

/**
 * Clear transaction history for a specific set of sender addresses.
 * Matches `tx.from` case-insensitively. Empty input is a no-op (the caller
 * should fall back to clearTxHistory() for a full wipe so orphaned entries
 * — txs whose sender no longer maps to any account — are also removed).
 */
export async function clearTxHistoryForAddresses(
  addresses: string[],
): Promise<void> {
  if (addresses.length === 0) return;
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const removeSet = new Set(addresses.map((a) => a.toLowerCase()));
    const remaining = history.filter(
      (tx) => !removeSet.has(tx.tx.from.toLowerCase()),
    );
    if (remaining.length === history.length) return; // nothing matched

    if (remaining.length === 0) {
      await chrome.storage.local.remove(TX_HISTORY_KEY);
    } else {
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: remaining });
    }

    chrome.runtime.sendMessage({ type: "txHistoryUpdated" }).catch(() => {
      // Ignore errors if no listeners
    });
  });
}
