import { captureEip7702DelegationAuthorization } from "../delegatedAuthorityPolicy";
import {
  processLocalTransactionInBackground,
  type GasOverrides,
} from "./localExecution";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  processingTxIds,
  resolvePinnedAccount,
} from "./runtime";
import { beginPendingRequestEffectLease } from "../requests/pendingRequestResolution";
import { validateTransactionNonceSelection } from "./noncePolicy";
import { replacementGasSelectionError } from "@/lib/transactionReplacement";
import {
  authorizePrivacyConfirmation,
  privacyConfirmationGasError,
} from "./privacyConfirmation";
import { resolveLocalTransactionKey } from "./localKeyRecovery";

type ConfirmationResult = { success: boolean; error?: string };
/** Confirms a pinned private-key or seed-phrase transaction for background execution. */
export async function handleConfirmTransactionAsyncPK(
  txId: string,
  password: string,
  _tabId?: number,
  functionName?: string,
  gasOverrides?: GasOverrides,
  forceInclusion?: boolean,
  feePaymentToken?: "native" | "token",
  feePaymentQuoteId?: string,
  nonce?: unknown,
): Promise<ConfirmationResult> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  const privacyGasError = privacyConfirmationGasError(
    pending,
    forceInclusion,
    feePaymentToken,
  );
  if (privacyGasError) return { success: false, error: privacyGasError };
  processingTxIds.add(txId);

  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: pinned.error };
  }
  const account = pinned.account;
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingTxIds.delete(txId);
    return { success: false, error: "Account does not support local signing" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== account.address.toLowerCase()
  ) {
    processingTxIds.delete(txId);
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  const nonceSelection = validateTransactionNonceSelection(
    nonce,
    feePaymentToken === "token"
      ? "feeToken"
      : forceInclusion
        ? "forceInclusion"
        : "native",
    pending.replacement?.nonce,
  );
  if (!nonceSelection.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: nonceSelection.error };
  }
  const reviewedNonce = nonceSelection.nonce;
  const replacementGasError = replacementGasSelectionError(
    pending.replacement,
    gasOverrides,
  );
  if (replacementGasError) {
    processingTxIds.delete(txId);
    return { success: false, error: replacementGasError };
  }

  const privacyAuthorization = await authorizePrivacyConfirmation(pending);
  if (!privacyAuthorization.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: privacyAuthorization.error };
  }

  let expectedDelegatedAuthorityAuthEpoch: string | undefined;
  try {
    expectedDelegatedAuthorityAuthEpoch =
      await captureEip7702DelegationAuthorization(
        pending.delegation7702Meta,
      );
  } catch (error) {
    processingTxIds.delete(txId);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Master unlock required",
    };
  }

  const key = await resolveLocalTransactionKey(account, password);
  if (!key.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: key.error };
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
        account,
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

  let forceInclusionProcessor:
    | typeof import("../forceInclusion/single")["processForceInclusionLocal"]
    | null = null;
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import("@/constants/chainRegistry");
    const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
    if (!info) {
      processingTxIds.delete(txId);
      return { success: false, error: "Chain does not support force inclusion" };
    }
    forceInclusionProcessor =
      info.protocol === "arbitrum"
        ? (await import("../arbitrumForceInclusion/single"))
            .processArbitrumForceInclusionLocal
        : (await import("../forceInclusion/single"))
            .processForceInclusionLocal;
  }
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
      signer: { account, privateKey: key.privateKey },
      functionName,
      effectLease,
      quote: feePaymentQuote,
    });
  } else if (forceInclusionProcessor) {
    void forceInclusionProcessor(
      txId,
      pending,
      account,
      key.privateKey,
      gasOverrides,
      effectLease,
    );
  } else {
    void processLocalTransactionInBackground(
      txId,
      pending,
      account,
      key.privateKey,
      functionName,
      gasOverrides,
      effectLease,
      expectedDelegatedAuthorityAuthEpoch,
      reviewedNonce,
      privacyAuthorization.shield,
      privacyAuthorization.ragequit,
      privacyAuthorization.directUnshield,
    );
  }
  return { success: true };
}
