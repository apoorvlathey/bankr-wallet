import { BUNDLE_STATUS } from "../erc5792Types";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { showNotification } from "../transactions/notification";
import { getTxById } from "../txHistoryStorage";
import type { ForceInclusionBroadcastResult } from "./batchTypes";

const MAX_WAIT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;

export async function trackBatchForceInclusionCompletion(
  bundleId: string,
  chainName: string,
  results: ForceInclusionBroadcastResult[],
): Promise<void> {
  const successfulTxIds = results.filter((r) => r.success).map((r) => r.txId);
  if (successfulTxIds.length === 0) return;
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    let allResolved = true;
    for (const txId of successfulTxIds) {
      const tx = await getTxById(txId);
      if (!tx || tx.status === "processing" || tx.status === "pending") {
        allResolved = false;
        break;
      }
    }
    if (allResolved) break;
  }

  let successCount = 0;
  let failCount = 0;
  let pendingCount = 0;
  for (const result of results) {
    if (!result.success) {
      failCount++;
      continue;
    }
    const tx = await getTxById(result.txId);
    if (tx?.status === "success") successCount++;
    else if (!tx || tx.status === "processing" || tx.status === "pending") {
      pendingCount++;
    } else failCount++;
  }

  const lastSuccessful = [...results]
    .reverse()
    .find((result) => result.success && result.l1TxHash);
  if (pendingCount > 0) {
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHash: lastSuccessful?.l1TxHash,
    });
    return;
  }

  const status =
    successCount === results.length
      ? BUNDLE_STATUS.CONFIRMED
      : failCount === results.length
        ? BUNDLE_STATUS.REVERTED
        : BUNDLE_STATUS.PARTIAL_REVERT;
  await updateBundleStatus(bundleId, {
    status,
    txHash: lastSuccessful?.l1TxHash,
    completedAt: Date.now(),
  });
  if (status === BUNDLE_STATUS.CONFIRMED) {
    await showNotification(
      `tx-success-${bundleId}`,
      "Batch Force Inclusion Complete",
      `All ${results.length} calls on ${chainName} confirmed via L1 deposit.`,
    );
  } else if (status === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Confirmed",
      `${successCount}/${results.length} calls confirmed on ${chainName}. ${failCount} failed.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Force Inclusion Failed",
      `All calls on ${chainName} failed.`,
    );
  }
}
