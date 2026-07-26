import type { SafeAddress, SafeProposalRecord } from "./types";
import { isFutureSafeNonceError } from "./proposalNonce";

export function isLocallyCancelledUnsignedSafeProposal(
  proposal: SafeProposalRecord,
): boolean {
  return proposal.state === "cancelled" &&
    !proposal.rejectedBySafeTxHash &&
    !proposal.purpose &&
    proposal.confirmations.length === 0 &&
    (proposal.unsupportedConfirmations?.length ?? 0) === 0 &&
    !proposal.effectClaim &&
    !proposal.transactionHash &&
    !proposal.userOperationHash &&
    !proposal.serializedExecution;
}

export function recoverInterruptedSafeProposalRecords(input: {
  records: SafeProposalRecord[];
  minimumAgeMs: number;
  now: number;
  safeAccountId?: string;
  activeClaimIds?: ReadonlySet<string>;
}): { records: SafeProposalRecord[]; recovered: SafeProposalRecord[] } {
  const recovered: SafeProposalRecord[] = [];
  const records = input.records.map((record) => {
    const claim = record.effectClaim;
    if (
      !claim ||
      input.activeClaimIds?.has(claim.claimId) ||
      input.now - claim.claimedAt < input.minimumAgeMs ||
      (input.safeAccountId && record.safeAccountId !== input.safeAccountId)
    ) return record;

    let updated: SafeProposalRecord;
    if (claim.kind === "publish") {
      updated = {
        ...record,
        state: "ambiguous",
        effectClaim: undefined,
        error: "Publication was interrupted; reconcile before retrying",
        updatedAt: input.now,
      };
    } else if (claim.kind === "execute" && (record.serializedExecution || record.transactionHash || record.userOperationHash)) {
      updated = {
        ...record,
        state: "ambiguous",
        effectClaim: undefined,
        error: "Execution was interrupted; reconciling exact signed bytes",
        updatedAt: input.now,
      };
    } else {
      updated = {
        ...record,
        state: claim.kind === "execute"
          ? "readyToExecute"
          : record.state === "authorizing"
            ? record.confirmations.length > 0
              ? "approvedLocally"
              : "draft"
            : record.state,
        effectClaim: undefined,
        error: "Interrupted Safe action can be retried",
        updatedAt: input.now,
      };
    }
    recovered.push(updated);
    return updated;
  });
  return { records, recovered };
}

export function assertSafeProposalEffectClaimable(
  proposal: SafeProposalRecord,
  input: {
    kind: "approve" | "publish" | "execute";
    ownerAddress?: SafeAddress;
  },
): void {
  if (proposal.effectClaim) throw new Error("Safe proposal operation already in progress");
  if (input.kind === "approve") {
    const legacyFutureNonce =
      proposal.state === "blocked" && isFutureSafeNonceError(proposal.error);
    if (
      !["draft", "approvedLocally", "awaitingApprovals"].includes(proposal.state) &&
      !legacyFutureNonce
    ) {
      throw new Error("Safe proposal cannot be approved in its current state");
    }
    if (
      input.ownerAddress &&
      proposal.confirmations.some((item) => item.ownerAddress === input.ownerAddress)
    ) {
      throw new Error("This Safe owner already approved");
    }
  }
  if (
    input.kind === "publish" &&
    !["approvedLocally", "awaitingApprovals", "readyToExecute"].includes(proposal.state)
  ) {
    throw new Error("Safe proposal cannot be published in its current state");
  }
  if (
    input.kind === "execute" &&
    (
      proposal.state !== "readyToExecute" ||
      !!proposal.transactionHash ||
      !!proposal.userOperationHash ||
      !!proposal.serializedExecution
    )
  ) {
    throw new Error("Safe proposal is not ready to execute");
  }
}
