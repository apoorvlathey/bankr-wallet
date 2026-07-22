import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { BankrApiError } from "../bankr/response";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { submitTransactionDirect } from "../bankr/submission";
import { extractAssetChangesWhenReceiptAvailable } from "../receiptEnrichment";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { updateTxInHistory } from "../txHistoryStorage";
import { fetchAndStoreGasData } from "./displayMetadata";
import { handleTransactionFailure } from "./failure";
import { showNotification } from "./notification";
import { activeAbortControllers, processingTxIds, writeResultToStorage } from "./runtime";
import {
  beginPrivacyShieldSubmission,
  recordPrivacyShieldSubmitted,
} from "../privacy/operations/lifecycle";
import type { PrivacyShieldConfirmationAuthorization } from "../privacy/operations/submission";
import {
  beginPrivacyRagequitSubmission,
  recordPrivacyRagequitSubmitted,
} from "../privacy/ragequit/lifecycle";
import type { PrivacyRagequitAuthorization } from "../privacy/ragequit/submission";
import {
  beginPrivacyDirectUnshieldSubmission,
  recordPrivacyDirectUnshieldSubmitted,
} from "../privacy/withdrawals/lifecycle";
import type { PrivacyDirectUnshieldAuthorization } from "../privacy/withdrawals/directConfirmation";
import { initializeBankrTransactionHistory } from "./bankrHistory";
/** Own the fire-and-forget Bankr submission and terminal publication flow. */
export async function processBankrTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  functionName?: string,
  effectLease?: PendingRequestEffectLease,
  privacyShieldAuthorization?: PrivacyShieldConfirmationAuthorization | null,
  privacyRagequitAuthorization?: PrivacyRagequitAuthorization | null,
  privacyDirectUnshieldAuthorization?: PrivacyDirectUnshieldAuthorization | null,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  let submittedTxHash: string | undefined;
  let submittedSuccessfully = false;
  let publishedTxHash: string | null = null;

  try {
    await initializeBankrTransactionHistory(txId, pending, functionName);

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
          async () => {
            await beginPrivacyShieldSubmission(
              pending,
              privacyShieldAuthorization ?? null,
            );
            await beginPrivacyRagequitSubmission(
              pending,
              privacyRagequitAuthorization ?? null,
            );
            await beginPrivacyDirectUnshieldSubmission(
              pending,
              privacyDirectUnshieldAuthorization ?? null,
            );
          },
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;
    submittedTxHash = txHash;
    submittedSuccessfully = result.status !== "reverted";

    if (txHash) {
      publishedTxHash = txHash;
      await recordPrivacyShieldSubmitted(pending, txHash).catch((error) =>
        console.warn("[privacy-shield] failed to persist submitted hash", error),
      );
      await recordPrivacyRagequitSubmitted(pending, txHash).catch((error) =>
        console.warn("[privacy-ragequit] failed to persist submitted hash", error),
      );
      await recordPrivacyDirectUnshieldSubmitted(pending, txHash).catch((error) =>
        console.warn("[privacy-unshield] failed to persist submitted hash", error),
      );
      if (pending.privacyShieldMeta || pending.privacyRagequitMeta || pending.privacyUnshieldMeta) {
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }
    }
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
      await handleTransactionFailure(txId, pending, errorMessage, {
        privacySubmissionOutcomeUncertain:
          publishedTxHash !== null ||
          (error instanceof BankrApiError && error.outcomeUncertain),
      });
    }
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}
