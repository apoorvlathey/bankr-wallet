/** Bankr batch confirmation, submission, and terminalization pipeline. */
import { BANKR_SUPPORTED_CHAIN_IDS, CHAIN_NAMES } from "../../constants/networks";
import { processingBundleIds } from "./batchExecutionRuntime";
import { getAccountById } from "../accountStorage";
import { handleUnlockWallet } from "../authHandlers";
import { loadDecryptedApiKey } from "../crypto";
import { removePendingBatchTxRequest, getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import { beginPendingRequestEffectLease } from "../requests/pendingRequestResolution";
import { getCachedApiKey, getCachedPassword, tryRestoreSession, setCachedApiKey } from "../sessionCache";
import { processBatchTransactionInBackground } from "./batchBankrProcessing";

export async function handleConfirmBatchTransaction(
  bundleId: string,
  password: string,
  functionNames?: string[],
  forceInclusion?: boolean,
  feePaymentToken?: "native" | "token",
  feePaymentQuoteId?: string,
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) return { success: false, error: "Batch request not found" };
  if (pending.intakeStatus === "validating") {
    return { success: false, error: "Batch request is still being validated" };
  }
  if (pending.privacyRagequitMeta) {
    if (forceInclusion || feePaymentToken === "token") {
      return {
        success: false,
        error: "Privacy Pools public exits require normal network gas payment",
      };
    }
    try {
      const { authorizePrivacyRagequitBatchConfirmation } = await import(
        "../privacy/ragequit/submission"
      );
      await authorizePrivacyRagequitBatchConfirmation(pending);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.message === "auth-required"
          ? "Unlock with your main password or biometrics and try again"
          : "Privacy Pools public exit is no longer available",
      };
    }
  }

  // SECURITY: resolve the pinned account; reject stale/missing bindings.
  if (!pending.accountId) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  const pinnedAccount = await getAccountById(pending.accountId);
  if (!pinnedAccount) {
    return { success: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    pinnedAccount.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (pinnedAccount.type !== "bankr") {
    return {
      success: false,
      error: "Pending request is no longer valid",
    };
  }

  // Validate chain support.
  // For force inclusion, the actual L1 deposit goes to the L1 chain — verify
  // THAT chain is in the Bankr-supported set (currently mainnet only).
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import(
      "../../constants/chainRegistry"
    );
    const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
    if (!info) {
      return { success: false, error: "Chain does not support force inclusion" };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        success: false,
        error: `Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.`,
      };
    }
  } else if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.chainId] || pending.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingBundleIds.add(bundleId);

  // Get API key (same pattern as handleConfirmTransactionAsync)
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    if (!getCachedPassword()) {
      await tryRestoreSession(handleUnlockWallet);
      apiKey = getCachedApiKey();
    }

    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  let feePaymentQuote;
  if (feePaymentToken === "token") {
    try {
      const { consumeFeePaymentQuote, feePaymentBatchCalls } = await import(
        "../feePayment/quotes"
      );
      feePaymentQuote = consumeFeePaymentQuote({
        quoteId: feePaymentQuoteId ?? "",
        family: "batchTransaction",
        requestId: bundleId,
        account: pinnedAccount,
        calls: feePaymentBatchCalls(pending),
      });
    } catch (error) {
      processingBundleIds.delete(bundleId);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Fee-token quote is invalid",
      };
    }
  }

  const forceInclusionProcessor = forceInclusion
    ? (await import("../forceInclusion/batch")).processForceInclusionBatchBankr
    : null;

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
  if (!authorization.authorized) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: authorization.error };
  }

  const effectLease = beginPendingRequestEffectLease(
    "batchTransaction",
    bundleId,
  );
  if (!effectLease) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Wallet reset is in progress" };
  }

  if (feePaymentToken === "token") {
    const { processUsdcBatchInBackground } = await import(
      "../feePayment/batchExecution"
    );
    void processUsdcBatchInBackground({
      bundleId,
      pending,
      signer: { account: pinnedAccount, apiKey },
      functionNames,
      effectLease,
      quote: feePaymentQuote,
    });
    return { success: true };
  }

  // Branch to force inclusion if requested
  if (forceInclusionProcessor) {
    forceInclusionProcessor(
      bundleId,
      pending,
      apiKey,
      functionNames,
      effectLease,
    );
    return { success: true };
  }

  // Process in background
  processBatchTransactionInBackground(
    bundleId,
    pending,
    apiKey,
    pinnedAccount.address,
    functionNames,
    effectLease,
  );

  return { success: true };
}


// ---------------------------------------------------------------------------
// Confirm batch transaction (PK/SP non-atomic path)
// ---------------------------------------------------------------------------
