import type { PendingBatchTxRequest } from "../erc5792Types";
import { buildApprovalRevokeCalls } from "../approvalCleanup/revokeList";
import { isSameApprovalRevokeCall } from "../approvalCleanup/revokeCall";
import { MAX_BATCH_CALLS } from "../provider/limits";
import { withStorageLock } from "../storageLock";
import {
  getPendingBatchTxRequests,
  PENDING_BATCH_TX_STORAGE_KEY,
  PENDING_BATCH_TX_STORAGE_LOCK_KEY,
} from "./pendingBatchTxStorage";

/** Append one canonical wallet-authored reducing-authority call. */
export async function appendApprovalRevokeToPendingBatchTxRequest(
  bundleId: string,
  tokenAddress: unknown,
  spender: unknown,
): Promise<{ success: boolean; error?: string; alreadyPresent?: boolean }> {
  return appendApprovalRevokesToPendingBatchTxRequest(bundleId, [
    { tokenAddress, spender },
  ]);
}

/** Atomically append canonical wallet-authored reducing-authority calls. */
export async function appendApprovalRevokesToPendingBatchTxRequest(
  bundleId: string,
  targets: unknown,
): Promise<{ success: boolean; error?: string; alreadyPresent?: boolean }> {
  const revokes = buildApprovalRevokeCalls(targets);
  return withStorageLock(PENDING_BATCH_TX_STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    const index = requests.findIndex((request) => request.id === bundleId);
    if (index === -1) {
      return { success: false, error: "Batch request not found" };
    }
    const target = requests[index];
    if (target.privacyRagequitMeta) {
      return { success: false, error: "Public exit calls cannot be changed" };
    }
    if (target.intakeStatus === "validating") {
      return { success: false, error: "Batch request is still being validated" };
    }
    const calls = target.params.calls ?? [];
    const additions = revokes.filter(
      (revoke) =>
        !calls.some((call) => isSameApprovalRevokeCall(call, revoke)),
    );
    if (additions.length === 0) {
      return { success: true, alreadyPresent: true };
    }
    if (calls.length + additions.length > MAX_BATCH_CALLS) {
      return { success: false, error: "Batch has reached the call limit" };
    }
    const updated: PendingBatchTxRequest = {
      ...target,
      params: {
        ...target.params,
        calls: [...calls, ...additions.map((revoke) => revoke.call)],
        atomicRequired: true,
      },
    };
    const next = [...requests];
    next[index] = updated;
    await chrome.storage.local.set({
      [PENDING_BATCH_TX_STORAGE_KEY]: next,
    });
    return { success: true };
  });
}
