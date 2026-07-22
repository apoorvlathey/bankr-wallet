import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
} from "../requests/pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { processBankrTransactionInBackground } from "./bankrProcessing";
import {
  getBankrApiKeyForConfirmation,
} from "./bankrSession";
import {
  bankrPrivacyConfirmationError,
  validateBankrTransactionChain,
  validatePinnedBankrTransaction,
} from "./bankrPolicy";
import { authorizePrivacyConfirmation } from "./privacyConfirmation";
import {
  processingTxIds,
} from "./runtime";
export { handleConfirmTransaction } from "./bankrImmediateConfirmation";

export async function handleConfirmTransactionAsync(
  txId: string,
  password: string,
  functionName?: string,
  forceInclusion?: boolean,
  feePaymentToken?: "native" | "token",
  feePaymentQuoteId?: string,
): Promise<{ success: boolean; error?: string }> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  const privacyError = bankrPrivacyConfirmationError(pending);
  if (privacyError) return { success: false, error: privacyError };
  const policy = await validatePinnedBankrTransaction(pending);
  if (!policy.ok) return { success: false, error: policy.error };
  const chainPolicy = validateBankrTransactionChain(
    pending.tx.chainId,
    forceInclusion,
  );
  if (!chainPolicy.ok) return { success: false, error: chainPolicy.error };

  const privacyAuthorization = await authorizePrivacyConfirmation(pending);
  if (!privacyAuthorization.ok) {
    return { success: false, error: privacyAuthorization.error };
  }

  processingTxIds.add(txId);
  const apiKey = await getBankrApiKeyForConfirmation(password);
  if (!apiKey) {
    processingTxIds.delete(txId);
    return { success: false, error: "Invalid password" };
  }

  let feePaymentQuote;
  if (feePaymentToken === "token") {
    try {
      const { consumeFeePaymentQuote, feePaymentSingleCalls } = await import(
        "../feePayment/quotes"
      );
      feePaymentQuote = consumeFeePaymentQuote({
        quoteId: feePaymentQuoteId ?? "",
        family: "transaction",
        requestId: txId,
        account: policy.account,
        calls: feePaymentSingleCalls(pending),
      });
    } catch (error) {
      processingTxIds.delete(txId);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Fee-token quote is invalid",
      };
    }
  }

  const forceInclusionProcessor = forceInclusion
    ? (await import("../forceInclusion/single")).processForceInclusionBankr
    : null;
  await removePendingTxRequest(txId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
  if (!authorization.authorized) {
    processingTxIds.delete(txId);
    return { success: false, error: authorization.error };
  }
  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    processingTxIds.delete(txId);
    return { success: false, error: "Wallet reset is in progress" };
  }

  if (feePaymentToken === "token") {
    const { processUsdcTransactionInBackground } = await import(
      "../feePayment/execution"
    );
    void processUsdcTransactionInBackground({
      txId,
      pending,
      signer: { account: policy.account, apiKey },
      functionName,
      effectLease,
      quote: feePaymentQuote,
    });
  } else if (forceInclusionProcessor) {
    forceInclusionProcessor(txId, pending, apiKey, effectLease);
  } else {
    processBankrTransactionInBackground(
      txId,
      pending,
      apiKey,
      functionName,
      effectLease,
      privacyAuthorization.shield,
      privacyAuthorization.ragequit,
      privacyAuthorization.directUnshield,
    );
  }
  return { success: true };
}
