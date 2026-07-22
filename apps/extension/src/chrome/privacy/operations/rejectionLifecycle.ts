import {
  getPendingTxRequests,
  removePendingTxRequest,
  type PendingTxRequest,
} from "../../requests/pendingTxStorage";
import { isPrivacyShieldPendingTransaction } from "./submission";
import {
  deleteRejectedPrivacyShieldOperation,
  deleteRejectedPrivacyShieldOperations,
  isRejectedPrivacyShieldOperation,
} from "./rejectionRepository";
import type { StoredPrivacyShieldOperationV1 } from "./types";

type Dependencies = {
  getPending: typeof getPendingTxRequests;
  removePending: typeof removePendingTxRequest;
  deleteRejected: typeof deleteRejectedPrivacyShieldOperation;
  deleteRejectedBatch: typeof deleteRejectedPrivacyShieldOperations;
};

const productionDependencies: Dependencies = {
  getPending: getPendingTxRequests,
  removePending: removePendingTxRequest,
  deleteRejected: deleteRejectedPrivacyShieldOperation,
  deleteRejectedBatch: deleteRejectedPrivacyShieldOperations,
};

/** Discard encrypted pre-effect material after its pending request is removed. */
export async function discardRejectedPrivacyShieldOperation(
  pending: PendingTxRequest,
  overrides: Partial<Dependencies> = {},
): Promise<void> {
  if (!isPrivacyShieldPendingTransaction(pending)) return;
  const dependencies = { ...productionDependencies, ...overrides };
  await dependencies.deleteRejected(pending.id);
}

/** Finish rejections interrupted after terminalization but before cleanup. */
export async function cleanupRejectedPrivacyShieldOperations(
  operations: readonly StoredPrivacyShieldOperationV1[],
  overrides: Partial<Dependencies> = {},
): Promise<StoredPrivacyShieldOperationV1[]> {
  const rejectedIds = operations
    .filter(isRejectedPrivacyShieldOperation)
    .map((operation) => operation.summary.id);
  if (rejectedIds.length === 0) return [...operations];

  const rejected = new Set(rejectedIds);
  const dependencies = { ...productionDependencies, ...overrides };
  const pending = await dependencies.getPending();
  for (const request of pending) {
    if (rejected.has(request.id) && isPrivacyShieldPendingTransaction(request)) {
      await dependencies.removePending(request.id);
    }
  }
  await dependencies.deleteRejectedBatch(rejectedIds);
  return operations.filter((operation) => !rejected.has(operation.summary.id));
}
