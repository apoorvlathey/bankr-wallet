import { BankrApiError } from "../bankr/response";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { submitTransactionDirect } from "../bankr/submission";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
} from "../requests/pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { processBankrTransactionInBackground } from "./bankrProcessing";
import {
  getBankrApiKeyForConfirmation,
} from "./bankrSession";
import {
  validateBankrTransactionChain,
  validatePinnedBankrTransaction,
} from "./bankrPolicy";
import {
  activeAbortControllers,
  processingTxIds,
  type TransactionResult,
} from "./runtime";

export async function handleConfirmTransaction(
  txId: string,
  password: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };

  const policy = await validatePinnedBankrTransaction(pending);
  if (!policy.ok) return { success: false, error: policy.error };

  const apiKey = await getBankrApiKeyForConfirmation(password);
  if (!apiKey) return { success: false, error: "Invalid password" };

  // Consume before the remote signer can accept the transaction. Safe
  // authentication/policy failures above intentionally leave it retryable.
  await removePendingTxRequest(txId);
  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
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

  try {
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
    if (result.status === "reverted") {
      return { success: false, error: "Transaction reverted" };
    }
    return { success: true, txHash: result.transactionHash };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error:
          "Transaction submission was interrupted. Its outcome is unknown; check activity before retrying.",
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

export async function handleConfirmTransactionAsync(
  txId: string,
  password: string,
  functionName?: string,
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  const policy = await validatePinnedBankrTransaction(pending);
  if (!policy.ok) return { success: false, error: policy.error };
  const chainPolicy = validateBankrTransactionChain(
    pending.tx.chainId,
    forceInclusion,
  );
  if (!chainPolicy.ok) return { success: false, error: chainPolicy.error };

  processingTxIds.add(txId);
  const apiKey = await getBankrApiKeyForConfirmation(password);
  if (!apiKey) {
    processingTxIds.delete(txId);
    return { success: false, error: "Invalid password" };
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

  if (forceInclusionProcessor) {
    forceInclusionProcessor(txId, pending, apiKey, effectLease);
  } else {
    processBankrTransactionInBackground(
      txId,
      pending,
      apiKey,
      functionName,
      effectLease,
    );
  }
  return { success: true };
}
