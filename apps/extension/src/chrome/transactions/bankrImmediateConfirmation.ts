import { BankrApiError } from "../bankr/response";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { submitTransactionDirect } from "../bankr/submission";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { getBankrApiKeyForConfirmation } from "./bankrSession";
import {
  bankrPrivacyConfirmationError,
  validatePinnedBankrTransaction,
} from "./bankrPolicy";
import { authorizePrivacyConfirmation } from "./privacyConfirmation";
import {
  beginPrivacyShieldSubmission,
  recordPrivacyShieldSubmitted,
  recordPrivacyShieldSubmissionFailure,
} from "../privacy/operations/lifecycle";
import {
  beginPrivacyRagequitSubmission,
  recordPrivacyRagequitSubmitted,
  recordPrivacyRagequitSubmissionFailure,
} from "../privacy/ragequit/lifecycle";
import {
  beginPrivacyDirectUnshieldSubmission,
  recordPrivacyDirectUnshieldSubmitted,
  recordPrivacyDirectUnshieldSubmissionFailure,
} from "../privacy/withdrawals/lifecycle";
import { activeAbortControllers, type TransactionResult } from "./runtime";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";

export async function handleConfirmTransaction(
  txId: string,
  password: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  const privacyError = bankrPrivacyConfirmationError(pending);
  if (privacyError) return { success: false, error: privacyError };
  const policy = await validatePinnedBankrTransaction(pending);
  if (!policy.ok) return { success: false, error: policy.error };
  const privacyAuthorization = await authorizePrivacyConfirmation(pending);
  if (!privacyAuthorization.ok) {
    return { success: false, error: privacyAuthorization.error };
  }
  const apiKey = await getBankrApiKeyForConfirmation(password);
  if (!apiKey) return { success: false, error: "Invalid password" };

  await removePendingTxRequest(txId);
  const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
    "transaction",
    pending,
  );
  if (!authorization.authorized) {
    return { success: false, error: authorization.error };
  }
  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  let publishedTxHash: string | null = null;

  try {
    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () => authorizePendingBankrSubmit(
        "transaction",
        pending,
        effectGuard.beginEffect,
        async () => {
          await beginPrivacyShieldSubmission(pending, privacyAuthorization.shield);
          await beginPrivacyRagequitSubmission(pending, privacyAuthorization.ragequit);
          await beginPrivacyDirectUnshieldSubmission(
            pending,
            privacyAuthorization.directUnshield,
          );
        },
      ),
    );
    effectGuard.settleEffect();
    if (result.transactionHash) {
      publishedTxHash = result.transactionHash;
      await recordPrivacyShieldSubmitted(pending, result.transactionHash);
      await recordPrivacyRagequitSubmitted(pending, result.transactionHash);
      await recordPrivacyDirectUnshieldSubmitted(pending, result.transactionHash);
      if (
        pending.privacyShieldMeta ||
        pending.privacyRagequitMeta ||
        pending.privacyUnshieldMeta
      ) startReceiptPolling(txId, result.transactionHash, pending.tx.chainId);
    }
    if (result.status === "reverted") {
      return { success: false, error: "Transaction reverted" };
    }
    return { success: true, txHash: result.transactionHash };
  } catch (error) {
    await recordPrivacyShieldSubmissionFailure(pending).catch(() => undefined);
    await recordPrivacyRagequitSubmissionFailure(pending).catch(() => undefined);
    await recordPrivacyDirectUnshieldSubmissionFailure(pending, {
      outcomeUncertain: publishedTxHash !== null ||
        (error instanceof BankrApiError && error.outcomeUncertain),
    }).catch(() => undefined);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Transaction submission was interrupted. Its outcome is unknown; check activity before retrying.",
      };
    }
    if (error instanceof BankrApiError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
  }
}
