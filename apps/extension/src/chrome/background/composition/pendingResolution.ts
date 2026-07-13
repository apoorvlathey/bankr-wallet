/** Shared pending-request coordination dependencies for transport composition. */

import {
  canSignalPendingTransactionCancellation,
  pendingRequestResolutionAction,
  runPendingRequestResolution,
  runPendingRequestResolutions,
  runWalletResetAgainstPendingResolutions,
  type PendingRequestResolutionAction,
} from "../../requests/pendingRequestResolution";

export function pendingResolutionConflict(
  winningAction: PendingRequestResolutionAction,
): { success: false; error: string } {
  const actionLabel: Record<PendingRequestResolutionAction, string> = {
    confirm: "confirmed",
    reject: "rejected",
    cancel: "cancelled",
    expire: "expired",
    move: "moved into a batch",
    edit: "edited",
    split: "split",
    reset: "reset",
  };
  return {
    success: false,
    error: `Request is already being ${actionLabel[winningAction]}`,
  };
}

export function createPendingResolutionComposition() {
  return {
    canSignalPendingTransactionCancellation,
    pendingRequestResolutionAction,
    runPendingRequestResolution,
    runPendingRequestResolutions,
    runWalletResetAgainstPendingResolutions,
    pendingResolutionConflict,
  };
}

export type PendingResolutionComposition = ReturnType<
  typeof createPendingResolutionComposition
>;
