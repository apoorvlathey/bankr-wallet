import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { updateTxInHistory } from "../txHistoryStorage";

export async function writeBatchForceInclusionFailure(
  bundleId: string,
  _pending: PendingBatchTxRequest,
  error: string,
): Promise<void> {
  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error,
    completedAt: Date.now(),
  });
  await updateTxInHistory(bundleId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });
  await showNotification(
    `tx-failed-${bundleId}`,
    "Batch Force Inclusion Failed",
    error.length > 100 ? `${error.substring(0, 100)}...` : error,
  );
  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error,
  });
}
