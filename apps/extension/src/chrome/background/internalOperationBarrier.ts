/** Builds reset-aware claims for extension-internal signing/submission effects. */

import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

type Dependencies = {
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  createRequestId: () => string;
};

/**
 * Independent internal operations receive unique claims, while the global
 * wallet-reset barrier observes every claim before an irreversible effect.
 */
export function createInternalIrreversibleOperationRunner(
  dependencies: Dependencies,
): <T>(resolve: () => Promise<T>) => Promise<T> {
  return <T>(resolve: () => Promise<T>): Promise<T> =>
    dependencies.runPendingRequestResolution({
      family: "internalOperation",
      requestId: dependencies.createRequestId(),
      action: "confirm",
      resolve,
      conflictResult: (action) =>
        dependencies.pendingResolutionConflict(action) as T,
    });
}
