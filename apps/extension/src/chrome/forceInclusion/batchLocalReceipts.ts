import type { Hash } from "viem";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { updateTxInHistory } from "../txHistoryStorage";
import { trackBatchForceInclusionCompletion } from "./batchCompletion";
import type { PreparedLocalForceInclusionBatch } from "./batchLocalPreparation";
import type { ForceInclusionBroadcastResult } from "./batchTypes";
import { L1_RECEIPT_TIMEOUT } from "./l1Client";
import { buildForceInclusionL1GasData } from "./l1GasData";
import { extractL2Hash } from "./singleOutcome";

export async function finalizeLocalForceInclusionBatch(args: {
  bundleId: string;
  pending: PendingBatchTxRequest;
  prepared: PreparedLocalForceInclusionBatch;
  results: ForceInclusionBroadcastResult[];
}): Promise<void> {
  const { bundleId, pending, prepared, results } = args;
  const successful = results.filter(
    (result) => result.success && result.l1TxHash,
  );
  if (successful.length === 0) {
    const error = results.find((result) => result.error)?.error ||
      "All L1 deposits failed";
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      error,
      completedAt: Date.now(),
    });
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Force Inclusion Failed",
      `All ${pending.params.calls.length} L1 deposits failed: ${error}`,
    );
    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: false,
      error,
    });
    return;
  }

  const txHashes = successful.map((result) => result.l1TxHash!);
  const primaryTxHash = txHashes[txHashes.length - 1] || txHashes[0];
  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.PENDING,
    txHashes,
    txHash: primaryTxHash,
  });
  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: true,
    txHash: primaryTxHash,
  });
  if (successful.length < results.length) {
    const failedCount = results.filter((result) => !result.success).length;
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Failed",
      `${failedCount}/${pending.params.calls.length} L1 deposits failed to broadcast`,
    );
  }

  const { startReceiptPolling } = await import("./receiptPoller");
  await Promise.all(
    successful.map(async (result) => {
      try {
        const receipt = await prepared.l1PublicClient.waitForTransactionReceipt({
          hash: result.l1TxHash! as Hash,
          timeout: L1_RECEIPT_TIMEOUT,
        });
        if (receipt.status === "reverted") {
          await updateTxInHistory(result.txId, {
            status: "failed",
            broadcastUncertain: false,
            error: "L1 deposit transaction reverted onchain",
            completedAt: Date.now(),
            forceInclusionMeta: {
              l1TxHash: result.l1TxHash!,
              l1ChainId: prepared.l1Chain.id,
              l2ChainId: pending.chainId,
              l2Confirmed: false,
            },
          });
          // `successful` and `results` intentionally share object identity so
          // aggregate completion observes this L1 revert.
          result.success = false;
          return;
        }
        const l2Hash = extractL2Hash(receipt);
        const resultHash = l2Hash || result.l1TxHash!;
        await updateTxInHistory(result.txId, {
          status: "pending",
          txHash: resultHash,
          broadcastUncertain: false,
          gasData: buildForceInclusionL1GasData(
            receipt,
            prepared.l1Chain.id,
          ),
          forceInclusionMeta: {
            l1TxHash: result.l1TxHash!,
            l1ChainId: prepared.l1Chain.id,
            l2ChainId: pending.chainId,
            l2Confirmed: false,
          },
        });
        if (l2Hash) startReceiptPolling(result.txId, l2Hash, pending.chainId);
      } catch {
        await updateTxInHistory(result.txId, {
          status: "pending",
          txHash: result.l1TxHash,
          broadcastUncertain: result.broadcastUncertain === true,
          error: "L1 receipt is still pending",
          forceInclusionMeta: {
            l1TxHash: result.l1TxHash!,
            l1ChainId: prepared.l1Chain.id,
            l2ChainId: pending.chainId,
            l2Confirmed: false,
          },
        });
      }
    }),
  );
  void trackBatchForceInclusionCompletion(
    bundleId,
    pending.chainName,
    results,
  );
}
