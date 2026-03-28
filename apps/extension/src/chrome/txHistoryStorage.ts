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
}

/**
 * Update an existing transaction in history
 */
export async function updateTxInHistory(
  txId: string,
  updates: Partial<CompletedTransaction>
): Promise<void> {
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
 * Get transactions awaiting on-chain confirmation (have txHash but not yet confirmed)
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
 */
export async function cleanupStaleProcessingTxs(
  maxAgeMs: number = 5 * 60 * 1000,
): Promise<void> {
  const history = await getTxHistory();
  const now = Date.now();
  let changed = false;

  for (const tx of history) {
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
