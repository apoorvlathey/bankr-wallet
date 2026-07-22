import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { submitTransactionDirect, type TransactionParams } from "../bankr/submission";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import {
  extractAssetChangesWhenReceiptAvailable,
  fetchRawTransactionReceipt,
  toBundleReceipt,
} from "../receiptEnrichment";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { processingBundleIds } from "./batchExecutionRuntime";
import { handleBatchFailure } from "./batchFailure";
import { fetchAndStoreBatchGasData } from "./batchGasEnrichment";
import { encodeBatchCalls } from "./batchTxEncoding";
import { updateBundleStatus } from "./bundleStatusStorage";

export async function processBatchTransactionInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  pinnedAddress: string,
  functionNames?: string[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    const batchTx = encodeBatchCalls(pending.params.calls, pinnedAddress);
    const tx: TransactionParams = {
      from: pinnedAddress,
      to: batchTx.to,
      data: batchTx.data,
      value: batchTx.value,
      chainId: pending.chainId,
    };
    const displayName = functionNames?.length
      ? `Batch: ${functionNames.join(", ")}`
      : `Batch (${pending.params.calls.length} calls)`;
    await addTxToHistory({
      id: bundleId,
      status: "processing",
      tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: "bankr",
      functionName: displayName,
      accountId: pending.accountId,
      privacyRagequitMeta: pending.privacyRagequitMeta ? { version: 1 } : undefined,
    });

    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
    if (!authorization.authorized) throw new Error(authorization.error);
    if (pending.privacyRagequitMeta) {
      const { authorizePrivacyRagequitBatchConfirmation } = await import(
        "../privacy/ragequit/submission"
      );
      const { beginPrivacyRagequitBatchSubmission } = await import(
        "../privacy/ragequit/lifecycle"
      );
      const privacyAuthorization =
        await authorizePrivacyRagequitBatchConfirmation(pending);
      await beginPrivacyRagequitBatchSubmission(pending, privacyAuthorization);
    }

    const result = await submitTransactionDirect(
      apiKey,
      tx,
      undefined,
      () => authorizePendingBankrSubmit(
        "batchTransaction",
        pending,
        effectGuard.beginEffect,
      ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;
    if (pending.privacyRagequitMeta && txHash) {
      const { recordPrivacyRagequitBatchSubmitted } = await import(
        "../privacy/ragequit/lifecycle"
      );
      await recordPrivacyRagequitBatchSubmitted(pending, txHash);
    }

    if (result.status === "reverted") {
      await handleBatchFailure(bundleId, pending, "Transaction reverted");
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
      if (txHash) {
        const { applyPrivacyRagequitReceipt } = await import(
          "../privacy/ragequit/lifecycle"
        );
        await applyPrivacyRagequitReceipt({
          txId: bundleId,
          txHash,
          chainId: pending.chainId,
          receipt: { logs: [] },
          succeeded: false,
        });
      }
    } else if (result.status === "success" && txHash) {
      const rawReceipt = await fetchRawTransactionReceipt(txHash, pending.chainId);
      const receipt = rawReceipt ? toBundleReceipt(rawReceipt.receipt) : null;
      if (pending.privacyRagequitMeta && rawReceipt) {
        const { applyPrivacyRagequitReceipt } = await import(
          "../privacy/ragequit/lifecycle"
        );
        await applyPrivacyRagequitReceipt({
          txId: bundleId,
          txHash,
          chainId: pending.chainId,
          receipt: rawReceipt.receipt,
          succeeded: true,
        });
      }
      if (pending.privacyRagequitMeta && !rawReceipt) {
        startReceiptPolling(bundleId, txHash, pending.chainId);
      }
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });
      await updateTxInHistory(bundleId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId: bundleId,
        txHash,
        chainId: pending.chainId,
        userAddress: pinnedAddress,
        receipt: rawReceipt?.receipt,
        rpcUrl: rawReceipt?.rpcUrl,
        logPrefix: "[batch]",
      });
      fetchAndStoreBatchGasData(bundleId, txHash, pending.chainId);

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      const notificationId = `tx-success-${bundleId}`;
      if (explorerUrl) {
        chrome.storage.local.set({ [`notification-${notificationId}`]: explorerUrl });
      }
      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch transaction (${pending.params.calls.length} calls) on ${pending.chainName} was successful.`,
      );
      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    } else {
      await updateBundleStatus(bundleId, { status: BUNDLE_STATUS.PENDING, txHash });
      await updateTxInHistory(bundleId, { status: "pending", txHash });
      if (txHash) startReceiptPolling(bundleId, txHash, pending.chainId);
      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, errorMessage);
  } finally {
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
  }
}
