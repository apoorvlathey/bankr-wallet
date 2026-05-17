/**
 * Transaction History Storage
 * Stores completed (processing/success/failed) transactions persistently
 */

import { TransactionParams } from "./bankrApi";

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
  /** Token logo URL (token list or KNOWN_TOKEN_LOGOS). Omitted for native sends. */
  tokenLogo?: string | null;
  /** ERC-20 token contract address (approve/transfer only). */
  tokenAddress?: string;
  /** Approve only — true when amount >= 2^128 (treated as unlimited). */
  isInfinite?: boolean;
  /** Spender / recipient / contract address (the thing the user is "sending to"). */
  counterparty?: string;
  /** First eth.sh label for counterparty, if any (e.g., "Uniswap V3 Router"). */
  counterpartyLabel?: string;
  /** Reverse-resolved ENS / Basename / WNS for counterparty, if any. */
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
  forceInclusionMeta?: ForceInclusionMeta;
  // Set on tx-history entries that are one slice of a user-split
  // wallet_sendCalls bundle. Used by the receipt poller and rejection
  // paths to advance the parent bundle's split sequencer.
  parentBundleId?: string;
  bundleIndex?: number;
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
let txHistoryWriteLock: Promise<unknown> = Promise.resolve();
function withTxHistoryLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chain the new task onto the previous one (success OR failure — we always
  // release the lock so a thrown error can't permanently freeze the queue).
  const next = txHistoryWriteLock.then(fn, fn);
  txHistoryWriteLock = next.catch(() => undefined);
  return next;
}

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
  return withTxHistoryLock(async () => {
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
  return withTxHistoryLock(async () => {
    const history = await getTxHistory();
    const index = history.findIndex((tx) => tx.id === txId);

    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: history });

      // Notify open views
      chrome.runtime
        .sendMessage({ type: "txHistoryUpdated", updatedTx: history[index] })
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
  return withTxHistoryLock(async () => {
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
  await chrome.storage.local.remove(TX_HISTORY_KEY);

  // Notify open views
  chrome.runtime.sendMessage({ type: "txHistoryUpdated" }).catch(() => {
    // Ignore errors if no listeners
  });
}
