import { updateBundleStatus } from "./bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { writeResultToStorage } from "../transactions/runtime";
import { updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";

export async function handleBatchFailure(
  bundleId: string,
  pending: PendingBatchTxRequest,
  error: string,
): Promise<void> {
  if (pending.privacyRagequitMeta) {
    const { recordPrivacyRagequitBatchSubmissionFailure } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await recordPrivacyRagequitBatchSubmissionFailure(pending).catch((cause) => {
      console.warn("[privacy-ragequit] batch failure mirror failed", cause);
    });
  }
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
    "Batch Transaction Failed",
    `Batch transaction on ${pending.chainName} failed: ${error}`,
  );
  await writeResultToStorage(`batchTxResult:${bundleId}`, { success: false, error });
}
