import { withStorageLock } from "../storageLock";
import type { CompletedTransaction } from "./types";

/** Released storage key. Changing it requires an explicit migration. */
export const TX_HISTORY_KEY = "txHistory";

/**
 * Every writer uses one in-process storage lock. Without it, two receipt or
 * status handlers can read the same prior array and the later whole-array
 * write silently loses the earlier update.
 */
export const TX_HISTORY_LOCK_KEY = `local:${TX_HISTORY_KEY}`;
export const MAX_HISTORY_SIZE = 50;

export function notifyTxHistoryUpdated(
  updatedTx?: CompletedTransaction,
  changedKeys?: string[],
): void {
  const message: Record<string, unknown> = { type: "txHistoryUpdated" };
  if (updatedTx) message.updatedTx = updatedTx;
  if (changedKeys) message.changedKeys = changedKeys;
  chrome.runtime.sendMessage(message).catch(() => {
    // Open extension views are optional.
  });
}

/** Returns the released newest-first array without schema rewriting. */
export async function getTxHistory(): Promise<CompletedTransaction[]> {
  const data = await chrome.storage.local.get(TX_HISTORY_KEY);
  return data[TX_HISTORY_KEY] || [];
}

export async function addTxToHistory(
  tx: CompletedTransaction,
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    history.unshift(tx);
    const trimmed = history.slice(0, MAX_HISTORY_SIZE);
    await chrome.storage.local.set({ [TX_HISTORY_KEY]: trimmed });
    notifyTxHistoryUpdated(tx);
  });
}

export async function updateTxInHistory(
  txId: string,
  updates: Partial<CompletedTransaction>,
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const index = history.findIndex((tx) => tx.id === txId);
    if (index === -1) return;

    history[index] = { ...history[index], ...updates };
    await chrome.storage.local.set({ [TX_HISTORY_KEY]: history });
    notifyTxHistoryUpdated(history[index], Object.keys(updates));
  });
}

export async function getTxById(
  txId: string,
): Promise<CompletedTransaction | null> {
  const history = await getTxHistory();
  return history.find((tx) => tx.id === txId) || null;
}

export async function getProcessingTxs(): Promise<CompletedTransaction[]> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "processing");
}

export async function getPendingConfirmationTxs(): Promise<
  CompletedTransaction[]
> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "pending" && tx.txHash);
}
