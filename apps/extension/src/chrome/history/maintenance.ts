import { withStorageLock } from "../storageLock";
import {
  getTxHistory,
  notifyTxHistoryUpdated,
  TX_HISTORY_KEY,
  TX_HISTORY_LOCK_KEY,
} from "./repository";

/**
 * Fails abandoned processing entries while leaving force-inclusion entries to
 * their receipt-based recovery path.
 */
export async function cleanupStaleProcessingTxs(
  maxAgeMs: number = 5 * 60 * 1000,
): Promise<void> {
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const now = Date.now();
    let changed = false;

    for (const tx of history) {
      if (tx.forceInclusionMeta) continue;
      if (tx.status === "processing" && now - tx.createdAt > maxAgeMs) {
        tx.status = "failed";
        tx.error = "Transaction timed out";
        tx.completedAt = now;
        changed = true;
      }
    }

    if (changed) {
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: history });
      notifyTxHistoryUpdated();
    }
  });
}

export async function clearTxHistory(): Promise<void> {
  await withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    await chrome.storage.local.remove(TX_HISTORY_KEY);
  });
  notifyTxHistoryUpdated();
}

/** Removes entries whose sender matches one of the supplied addresses. */
export async function clearTxHistoryForAddresses(
  addresses: string[],
): Promise<void> {
  if (addresses.length === 0) return;
  return withStorageLock(TX_HISTORY_LOCK_KEY, async () => {
    const history = await getTxHistory();
    const removeSet = new Set(addresses.map((address) => address.toLowerCase()));
    const remaining = history.filter(
      (tx) => !removeSet.has(tx.tx.from.toLowerCase()),
    );
    if (remaining.length === history.length) return;

    if (remaining.length === 0) {
      await chrome.storage.local.remove(TX_HISTORY_KEY);
    } else {
      await chrome.storage.local.set({ [TX_HISTORY_KEY]: remaining });
    }
    notifyTxHistoryUpdated();
  });
}
