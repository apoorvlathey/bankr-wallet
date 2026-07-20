import type {
  SafeOwnerConfirmation,
  SafeProposalRecord,
} from "./types";

const LOCAL_WORKFLOW_STATES = new Set<SafeProposalRecord["state"]>([
  "authorizing",
  "approvedLocally",
  "publishing",
]);

const LOCAL_TERMINAL_STATES = new Set<SafeProposalRecord["state"]>([
  "executed",
  "failed",
  "replaced",
]);

function mergeConfirmations(
  local: readonly SafeOwnerConfirmation[],
  remote: readonly SafeOwnerConfirmation[],
): SafeOwnerConfirmation[] {
  const byOwner = new Map(local.map((item) => [item.ownerAddress, item]));
  for (const confirmation of remote) {
    const existing = byOwner.get(confirmation.ownerAddress);
    byOwner.set(confirmation.ownerAddress, existing
      ? {
          ...confirmation,
          accountId: existing.accountId,
          accountType: existing.accountType,
        }
      : confirmation);
  }
  return [...byOwner.values()];
}

/**
 * Safe Transaction Service coordinates approvals, but it cannot downgrade an
 * effect that WalletChan has already prepared or broadcast locally. Onchain
 * receipt/nonce reconciliation remains the terminal authority for execution.
 */
export function mergeSafeServiceProposal(
  current: SafeProposalRecord,
  remote: SafeProposalRecord,
  now = Date.now(),
): SafeProposalRecord {
  const remoteHasSignatures = remote.confirmations.length > 0 ||
    (remote.unsupportedConfirmations?.length ?? 0) > 0;
  const preserveLocalCancellation =
    current.state === "cancelled" &&
    !current.rejectedBySafeTxHash &&
    !remoteHasSignatures;
  const preserveOnchainRejection =
    !!current.rejectedBySafeTxHash && remote.state === "replaced";
  const hasLocalExecution =
    (!!current.transactionHash || !!current.serializedExecution) &&
    !LOCAL_TERMINAL_STATES.has(current.state) &&
    current.state !== "cancelled";
  const preserveActiveEffect = !!current.effectClaim;
  const preserveActiveExecution = hasLocalExecution;
  const remoteExecutionHash = remote.state === "executed"
    ? remote.transactionHash
    : undefined;
  const preserveLocalWorkflow =
    LOCAL_WORKFLOW_STATES.has(current.state) &&
    remote.state !== "executed" &&
    remote.state !== "replaced";
  const preserveReadyQuorum =
    current.state === "readyToExecute" && remote.state === "awaitingApprovals";
  const preserveLocalTerminal =
    LOCAL_TERMINAL_STATES.has(current.state) && remote.state !== "executed";
  const preserveCurrent =
    preserveLocalCancellation ||
    preserveOnchainRejection ||
    preserveActiveEffect ||
    preserveActiveExecution ||
    preserveLocalWorkflow ||
    preserveReadyQuorum ||
    preserveLocalTerminal;
  const preserveExecutionData = preserveActiveEffect || preserveActiveExecution;
  let state = remote.state;
  if (preserveLocalCancellation || preserveOnchainRejection) {
    state = "cancelled";
  } else if (preserveActiveExecution) {
    state = current.state === "executing" ? "executing" : "ambiguous";
  } else if (preserveCurrent) {
    state = current.state;
  }
  const transactionHash = preserveActiveExecution
    ? remoteExecutionHash ?? current.transactionHash
    : preserveActiveEffect
      ? current.transactionHash
      : remote.transactionHash;

  return {
    ...remote,
    route: current.route,
    confirmations: mergeConfirmations(current.confirmations, remote.confirmations),
    purpose: current.purpose ?? remote.purpose,
    rejectedBySafeTxHash: current.rejectedBySafeTxHash,
    state,
    transactionHash,
    serializedExecution: preserveExecutionData && !remoteExecutionHash
      ? current.serializedExecution
      : undefined,
    executionPreparedAt: preserveExecutionData && !remoteExecutionHash
      ? current.executionPreparedAt
      : undefined,
    executor: current.executor,
    effectClaim: preserveActiveEffect ? current.effectClaim : undefined,
    error: preserveActiveExecution && remoteExecutionHash
      ? undefined
      : preserveCurrent
        ? current.error
        : remote.error,
    hiddenAt: current.hiddenAt,
    createdAt: current.createdAt,
    updatedAt: now,
  };
}
