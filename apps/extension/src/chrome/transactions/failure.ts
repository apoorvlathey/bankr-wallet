import type { PendingTxRequest } from "../requests/pendingTxStorage";
import {
  failedTxResults,
  writeResultToStorage,
} from "./runtime";
import { updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "./notification";

/** Publishes a local or remote transaction failure to history and wallet UI. */
export async function handleTransactionFailure(
  txId: string,
  pending: PendingTxRequest,
  error: string,
  options: { privacySubmissionOutcomeUncertain?: boolean } = {},
): Promise<void> {
  const notificationId = `tx-failed-${txId}`;

  try {
    const { recordPrivacyShieldSubmissionFailure } = await import(
      "../privacy/operations/lifecycle"
    );
    await recordPrivacyShieldSubmissionFailure(pending);
  } catch (trackingError) {
    console.warn("[privacy-shield] failed to persist transaction failure", trackingError);
  }
  try {
    const { recordPrivacyRagequitSubmissionFailure } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await recordPrivacyRagequitSubmissionFailure(pending);
  } catch (trackingError) {
    console.warn("[privacy-ragequit] failed to persist transaction failure", trackingError);
  }
  try {
    const { recordPrivacyDirectUnshieldSubmissionFailure } = await import(
      "../privacy/withdrawals/lifecycle"
    );
    await recordPrivacyDirectUnshieldSubmissionFailure(pending, {
      outcomeUncertain: options.privacySubmissionOutcomeUncertain,
    });
  } catch (trackingError) {
    console.warn("[privacy-unshield] failed to persist transaction failure", trackingError);
  }

  await updateTxInHistory(txId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  if (pending.parentBundleId && pending.bundleIndex !== undefined) {
    const { advanceSplitBundle } = await import("../forceInclusion/splitBatchSequencer");
    await advanceSplitBundle({
      bundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      outcome: "rejected",
      errorMessage: error,
    });
  }

  failedTxResults.set(notificationId, {
    txId,
    error,
    origin: pending.origin,
    chainId: pending.tx.chainId,
    timestamp: Date.now(),
  });
  chrome.storage.local.set({
    [`notification-${notificationId}`]: { type: "error", txId: notificationId },
  });

  await showNotification(
    notificationId,
    "Transaction Failed",
    error.length > 100 ? `${error.substring(0, 100)}...` : error,
  );
  await writeResultToStorage(`txResult:${txId}`, { success: false, error });
}
