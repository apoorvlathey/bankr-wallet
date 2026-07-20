import { withStorageLock } from "../storageLock";
import {
  putHistoryTransaction,
  queryHistoryPage,
  readAllHistoryTransactions,
  readHistoryTransaction,
  updateHistoryTransaction,
} from "./database";
import { selectHistoryGasData } from "./gasDataPolicy";
import type { CompletedTransaction } from "./types";
import type { TxHistoryCursor, TxHistoryPage } from "./queryTypes";

/** Legacy key retained only as the idempotent IndexedDB migration source. */
export const TX_HISTORY_KEY = "txHistory";
export const TX_HISTORY_LOCK_KEY = `history:indexeddb`;
export function notifyTxHistoryUpdated(
  updatedTx?: CompletedTransaction,
  changedKeys?: string[],
): void {
  const message: Record<string, unknown> = { type: "txHistoryUpdated" };
  if (updatedTx) {
    message.txId = updatedTx.id;
    message.ownerAddress = updatedTx.tx.from.toLowerCase();
    message.chainId = updatedTx.chainId;
  }
  if (changedKeys) message.changedKeys = changedKeys;
  chrome.runtime.sendMessage(message).catch(() => {
    // Open extension views are optional.
  });
}

/** Compatibility read for recovery and settings; Activity uses cursor pages. */
export async function getTxHistory(): Promise<CompletedTransaction[]> {
  return readAllHistoryTransactions();
}

export async function getTxHistoryPage(options: {
  ownerAddress?: string;
  chainId?: number | null;
  cursor?: TxHistoryCursor | null;
  limit?: number;
}): Promise<TxHistoryPage> {
  return queryHistoryPage(options);
}

export async function addTxToHistory(
  tx: CompletedTransaction,
): Promise<CompletedTransaction> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const existing = await readHistoryTransaction(tx.id, true);
    if (existing) return existing;
    await putHistoryTransaction(tx);
    notifyTxHistoryUpdated(tx);
    return tx;
  });
}
/** Recovery-facing name for the repository's idempotent add primitive. */
export const addTxToHistoryIfAbsent = addTxToHistory;
export async function updateTxInHistory(
  txId: string,
  updates: Partial<CompletedTransaction>,
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const current = await readHistoryTransaction(txId, true);
    if (!current) return;
    const protectedUpdates = Object.prototype.hasOwnProperty.call(updates, "gasData")
      ? {
          ...updates,
          gasData: selectHistoryGasData(current, updates.gasData),
        }
      : updates;
    const updated = await updateHistoryTransaction(txId, protectedUpdates);
    if (updated) notifyTxHistoryUpdated(updated, Object.keys(updates));
  });
}

export async function getTxById(txId: string): Promise<CompletedTransaction | null> {
  return readHistoryTransaction(txId, true);
}

export async function getProcessingTxs(): Promise<CompletedTransaction[]> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "processing");
}

export async function getPendingConfirmationTxs(): Promise<CompletedTransaction[]> {
  const history = await getTxHistory();
  return history.filter((tx) => tx.status === "pending" && tx.txHash);
}
