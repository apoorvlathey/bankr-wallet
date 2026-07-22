import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { BankrApiError } from "../bankr/response";
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
  let publishedTxHash: string | null = null;

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
      accountId: pending.accountId,
      privacyRagequitMeta: pending.privacyRagequitMeta ? { version: 1 } : undefined,
      privacyUnshieldMeta: pending.privacyUnshieldMeta ? { version: 1 } : undefined,
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
    if (txHash) {
      publishedTxHash = txHash;
      await recordPrivacyShieldSubmitted(pending, txHash);
      await recordPrivacyRagequitSubmitted(pending, txHash);
      await recordPrivacyDirectUnshieldSubmitted(pending, txHash);
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
    await handleTransactionFailure(txId, pending, errorMessage, {
      privacySubmissionOutcomeUncertain: publishedTxHash !== null ||
        (error instanceof BankrApiError && error.outcomeUncertain),
    });
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}
