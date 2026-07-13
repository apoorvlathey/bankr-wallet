import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { updateBundleStatus } from "./bundleStatusStorage";
import {
  BUNDLE_STATUS,
  type BundleReceipt,
  type PendingBatchTxRequest,
} from "../erc5792Types";
import { fetchBundleReceipt } from "../receiptEnrichment";
import { getTxById } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";

export interface SequentialBatchResult {
  txId: string;
  success: boolean;
  txHash?: string;
  receipt?: BundleReceipt;
  error?: string;
}

const MAX_WAIT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;

/** Mirror terminal per-call history into an aggregate non-atomic bundle. */
export async function trackNonAtomicBundleCompletion(
  bundleId: string,
  pending: PendingBatchTxRequest,
  results: SequentialBatchResult[],
): Promise<void> {
  const successfulTxIds = results
    .filter((result) => result.success)
    .map((result) => result.txId);
  if (successfulTxIds.length === 0) return;

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_MS) {
    await delay(POLL_INTERVAL_MS);
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

  const receipts: BundleReceipt[] = [];
  let successCount = 0;
  let failCount = 0;
  for (const result of results) {
    if (!result.success) {
      failCount += 1;
      continue;
    }
    const tx = await getTxById(result.txId);
    if (tx?.status === "success") {
      successCount += 1;
      if (result.txHash) {
        const receipt = await fetchBundleReceipt(
          result.txHash,
          pending.chainId,
        );
        if (receipt) receipts.push(receipt);
      }
    } else {
      failCount += 1;
    }
  }

  const aggregateStatus =
    successCount === results.length
      ? BUNDLE_STATUS.CONFIRMED
      : failCount === results.length
        ? BUNDLE_STATUS.REVERTED
        : BUNDLE_STATUS.PARTIAL_REVERT;
  const lastSuccessfulTx = [...results]
    .reverse()
    .find((result) => result.success && result.txHash);
  await updateBundleStatus(bundleId, {
    status: aggregateStatus,
    txHash: lastSuccessfulTx?.txHash,
    receipts: receipts.length > 0 ? receipts.reverse() : undefined,
    completedAt: Date.now(),
  });

  if (aggregateStatus === BUNDLE_STATUS.CONFIRMED) {
    const notificationId = `tx-success-${bundleId}`;
    const lastTxHash = lastSuccessfulTx?.txHash || results[0]?.txHash;
    const explorerUrl = CHAIN_CONFIG[pending.chainId]?.explorer && lastTxHash
      ? `${CHAIN_CONFIG[pending.chainId].explorer}/tx/${lastTxHash}`
      : null;
    if (explorerUrl) {
      chrome.storage.local.set({
        [`notification-${notificationId}`]: explorerUrl,
      });
    }
    await showNotification(
      notificationId,
      "Batch Transaction Confirmed",
      `All ${results.length} calls on ${pending.chainName} confirmed successfully.`,
    );
  } else if (aggregateStatus === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Reverted",
      `${successCount}/${results.length} calls succeeded on ${pending.chainName}. ${failCount} reverted.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Reverted",
      `All calls on ${pending.chainName} reverted.`,
    );
  }
}

/** Mirror one local atomic transaction's terminal history into its bundle. */
export async function trackAtomicBundleCompletion(
  bundleId: string,
  txHash: string,
  pending: PendingBatchTxRequest,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_MS) {
    await delay(POLL_INTERVAL_MS);
    const tx = await getTxById(bundleId);
    if (!tx || tx.status === "processing" || tx.status === "pending") continue;

    if (tx.status === "success") {
      const receipt = await fetchBundleReceipt(txHash, pending.chainId);
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });
      const notificationId = `tx-success-${bundleId}`;
      const explorer = CHAIN_CONFIG[pending.chainId]?.explorer;
      if (explorer) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: `${explorer}/tx/${txHash}`,
        });
      }
      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch (${pending.params.calls.length} call${
          pending.params.calls.length === 1 ? "" : "s"
        }) on ${pending.chainName} was successful.`,
      );
    } else {
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        error: tx.error || "Transaction reverted",
        completedAt: Date.now(),
      });
      await showNotification(
        `tx-failed-${bundleId}`,
        "Batch Transaction Reverted",
        `Batch on ${pending.chainName} reverted onchain.`,
      );
    }
    return;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
