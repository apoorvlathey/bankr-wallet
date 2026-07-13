import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
import { activeAbortControllers, writeResultToStorage, type TransactionResult } from "./runtime";

export async function handleRejectTransaction(
  txId: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) {
    return { success: false, error: "Transaction request not found" };
  }
  await removePendingTxRequest(txId);
  await writeResultToStorage(`txResult:${txId}`, {
    success: false,
    error: "Transaction rejected by user",
  });
  if (pending.parentBundleId && pending.bundleIndex !== undefined) {
    const { advanceSplitBundle } = await import(
      "../forceInclusion/splitBatchSequencer"
    );
    await advanceSplitBundle({
      bundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      outcome: "rejected",
    });
  }
  return { success: false, error: "Transaction rejected by user" };
}

export async function handleCancelTransaction(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const abortController = activeAbortControllers.get(txId);
  if (!abortController) {
    return { success: false, error: "No active transaction to cancel" };
  }
  abortController.abort();
  activeAbortControllers.delete(txId);
  return { success: true };
}

export async function handleCancelProcessingTx(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const controller = activeAbortControllers.get(txId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(txId);
  }
  const tx = await getTxById(txId);
  if (tx && tx.status === "processing") {
    await updateTxInHistory(txId, {
      status: "failed",
      error: "Cancelled by user",
      completedAt: Date.now(),
    });
  }
  return { success: true };
}
