import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { submitTransactionDirect } from "../bankr/submission";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import { extractAssetChangesWhenReceiptAvailable } from "../receiptEnrichment";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
} from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import {
  addTxToHistory,
  updateTxInHistory,
} from "../txHistoryStorage";
import { fetchAndStoreGasData, lookupFunctionName } from "./displayMetadata";
import { handleTransactionFailure } from "./failure";
import { showNotification } from "./notification";
import {
  activeAbortControllers,
  processingTxIds,
  writeResultToStorage,
} from "./runtime";

/** Own the fire-and-forget Bankr submission and terminal publication flow. */
export async function processBankrTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  functionName?: string,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  let submittedTxHash: string | undefined;
  let submittedSuccessfully = false;

  try {
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: pending.tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.tx.chainId,
      createdAt: pending.timestamp,
      accountType: "bankr",
      functionName,
    });

    if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
      lookupFunctionName(pending.tx.data).then((name) => {
        if (name) updateTxInHistory(txId, { functionName: name });
      });
    }
    attachClearSignedMetaToHistory(
      txId,
      { ...pending.tx, to: pending.tx.to ?? undefined },
      pending.tx.chainId,
    );

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "transaction",
        pending,
      );
    if (!authorization.authorized) throw new Error(authorization.error);

    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;
    submittedTxHash = txHash;
    submittedSuccessfully = result.status !== "reverted";

    if (result.status === "reverted") {
      await handleTransactionFailure(txId, pending, "Transaction reverted");
    } else if (result.status === "success" && txHash) {
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId,
        txHash,
        chainId: pending.tx.chainId,
        userAddress: pending.tx.from,
        logPrefix: "[bankr]",
      });
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }
      await showNotification(
        notificationId,
        "Transaction Confirmed",
        `Transaction on ${pending.chainName} was successful. Click to view.`,
      );
      await writeResultToStorage(`txResult:${txId}`, {
        success: true,
        txHash,
      });
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
      if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
      await writeResultToStorage(`txResult:${txId}`, {
        success: true,
        txHash,
      });
    }
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage =
        error.name === "AbortError"
          ? "Transaction submission was interrupted. Its outcome is unknown; check activity before retrying."
          : error.message;
    }
    if (submittedSuccessfully) {
      console.error("[bankr] Post-broadcast history update failed", error);
      await writeResultToStorage(`txResult:${txId}`, {
        success: true,
        txHash: submittedTxHash,
      });
    } else {
      await handleTransactionFailure(txId, pending, errorMessage);
    }
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}
