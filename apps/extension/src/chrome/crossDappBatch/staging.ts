import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import { writeResultToStorage } from "../transactions/runtime";
import {
  clearCrossDappBatch,
  getCrossDappBatch,
  setCrossDappBatch,
  updateEntryDataInCrossDappBatch,
  type CrossDappBatchEntry,
} from "./storage";

export async function handleUpdateCallInCrossDappBatch(
  txId: string,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await updateEntryDataInCrossDappBatch(txId, newData);
  if (result.success) notifyBatchUpdated();
  return result;
}

export async function handleRemoveFromCrossDappBatch(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: false, error: "No active batch" };
  const entry = batch.entries.find((candidate) => candidate.txId === txId);
  if (!entry) {
    return { success: false, error: "Entry not found in batch" };
  }

  const removed = entriesRemovedWith(entry, batch.entries);
  const removedIds = new Set(removed.map((candidate) => candidate.txId));
  const remaining = batch.entries.filter(
    (candidate) => !removedIds.has(candidate.txId),
  );
  const seenBundles = new Set<string>();
  for (const candidate of removed) {
    if (candidate.source?.kind === "wallet_sendCalls") {
      const bundleId = candidate.source.bundleId;
      if (seenBundles.has(bundleId)) continue;
      seenBundles.add(bundleId);
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
        error: "Removed from cross-dapp batch by user",
        completedAt: Date.now(),
      });
    } else if (candidate.source?.kind !== "walletGenerated") {
      await writeResultToStorage(`txResult:${candidate.txId}`, {
        success: false,
        error: "Removed from batch by user",
      });
    }
  }
  if (remaining.length === 0) await clearCrossDappBatch();
  else await setCrossDappBatch({ ...batch, entries: remaining });
  notifyBatchUpdated();
  return { success: true };
}

export async function handleRejectCrossDappBatch(): Promise<{
  success: boolean;
  error?: string;
}> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: true };
  const seenBundles = new Set<string>();
  await Promise.all(
    batch.entries.map((entry) => {
      if (entry.source?.kind === "wallet_sendCalls") {
        const bundleId = entry.source.bundleId;
        if (seenBundles.has(bundleId)) return Promise.resolve();
        seenBundles.add(bundleId);
        return updateBundleStatus(bundleId, {
          status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
          error: "Cross-dapp batch rejected by user",
          completedAt: Date.now(),
        });
      }
      if (entry.source?.kind === "walletGenerated") return Promise.resolve();
      return writeResultToStorage(`txResult:${entry.txId}`, {
        success: false,
        error: "Batch rejected by user",
      });
    }),
  );
  await clearCrossDappBatch();
  notifyBatchUpdated();
  return { success: true };
}

function entriesRemovedWith(
  entry: CrossDappBatchEntry,
  entries: CrossDappBatchEntry[],
): CrossDappBatchEntry[] {
  if (entry.source?.kind === "walletGenerated") return [entry];
  if (entry.source?.kind === "eth_sendTransaction" || !entry.source) {
    return entries.filter((candidate) =>
      candidate.txId === entry.txId ||
      (
        candidate.source?.kind === "walletGenerated" &&
        candidate.source.parentTxId === entry.txId
      )
    );
  }
  if (entry.source?.kind !== "wallet_sendCalls") return [entry];
  const bundleId = entry.source.bundleId;
  return entries.filter(
    (candidate) =>
      (
        candidate.source?.kind === "wallet_sendCalls" &&
        candidate.source.bundleId === bundleId
      ) ||
      (
        candidate.source?.kind === "walletGenerated" &&
        candidate.source.parentBundleId === bundleId
      ),
  );
}

function notifyBatchUpdated(): void {
  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});
}
