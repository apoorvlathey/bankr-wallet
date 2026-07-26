import {
  appendApprovalRevokesToPendingBatchTxRequest,
} from "../requests/pendingBatchApprovalCleanup";
import { getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import {
  eligibilityErrorForCrossDappBatch,
  resolvePinnedCrossDappAccount,
} from "../crossDappBatch/accountPolicy";
import { supportsAtomicEoaApprovalCleanup } from "../approvalCleanup/accountPolicy";

/** Add a reducing-authority call only to a pinned, atomic local batch. */
export async function handleAppendApprovalRevokeToPendingBatch(
  bundleId: string,
  tokenAddress: unknown,
  spender: unknown,
): Promise<{ success: boolean; error?: string; alreadyPresent?: boolean }> {
  return handleAppendApprovalRevokesToPendingBatch(bundleId, [
    { tokenAddress, spender },
  ]);
}

/** Add multiple reducing-authority calls through one pinned batch edit. */
export async function handleAppendApprovalRevokesToPendingBatch(
  bundleId: string,
  targets: unknown,
): Promise<{ success: boolean; error?: string; alreadyPresent?: boolean }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) return { success: false, error: "Batch request not found" };
  const pinned = await resolvePinnedCrossDappAccount(
    pending,
    pending.params.from,
  );
  if (!pinned.ok) return { success: false, error: pinned.error };
  if (!supportsAtomicEoaApprovalCleanup(pinned.account.type)) {
    return {
      success: false,
      error: "This account cannot add an approval cleanup to the batch",
    };
  }
  const eligibilityError = await eligibilityErrorForCrossDappBatch(
    pinned.account,
    pending.chainId,
    pending.chainName,
  );
  if (eligibilityError) {
    return { success: false, error: eligibilityError };
  }
  return appendApprovalRevokesToPendingBatchTxRequest(bundleId, targets);
}
