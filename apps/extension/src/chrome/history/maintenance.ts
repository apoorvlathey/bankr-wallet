import { withStorageLock } from "../storageLock";
import {
  clearHistoryDatabase,
  removeHistoryTransactions,
} from "./database";
import {
  getTxHistory,
  notifyTxHistoryUpdated,
  TX_HISTORY_LOCK_KEY,
  updateTxInHistory,
} from "./repository";

/** Fail abandoned processing entries without touching receipt-owned recovery. */
export async function cleanupStaleProcessingTxs(
  maxAgeMs: number = 5 * 60 * 1000,
): Promise<void> {
  const history = await getTxHistory();
  const now = Date.now();
  for (const tx of history) {
    if (tx.forceInclusionMeta) continue;
    if (tx.status === "processing" && now - tx.createdAt > maxAgeMs) {
      await updateTxInHistory(tx.id, {
        status: "failed",
        error: "Transaction timed out",
        completedAt: now,
      });
    }
  }
}

export async function clearTxHistory(): Promise<void> {
  await withStorageLock(TX_HISTORY_LOCK_KEY, clearHistoryDatabase);
  notifyTxHistoryUpdated();
}

export async function clearTxHistoryForAddresses(addresses: string[]): Promise<void> {
  if (addresses.length === 0) return;
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const removeSet = new Set(addresses.map((address) => address.toLowerCase()));
    const history = await getTxHistory();
    const ids = history
      .filter((tx) => removeSet.has(tx.tx.from.toLowerCase()))
      .map((tx) => tx.id);
    if (ids.length === 0) return;
    await removeHistoryTransactions(ids);
    notifyTxHistoryUpdated();
  });
}
