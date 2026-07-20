import type { SafeProposalRecord } from "./types";
import { hasUnresolvedSafeExecution } from "./executionPolicy";

const REJECTABLE_STATES = new Set<SafeProposalRecord["state"]>([
  "draft",
  "approvedLocally",
  "awaitingApprovals",
  "readyToExecute",
]);

export function hasSafeProposalSignatures(
  proposal: Pick<SafeProposalRecord, "confirmations" | "unsupportedConfirmations">,
): boolean {
  return proposal.confirmations.length > 0 ||
    (proposal.unsupportedConfirmations?.length ?? 0) > 0;
}

export function isCanonicalSafeRejection(
  proposal: Pick<SafeProposalRecord, "safeAddress" | "calls" | "transaction">,
): boolean {
  return proposal.calls.length === 1 &&
    proposal.calls[0]?.to === proposal.safeAddress &&
    proposal.calls[0]?.value === "0" &&
    proposal.calls[0]?.data === "0x" &&
    proposal.calls[0]?.operation === 0 &&
    proposal.transaction.to === proposal.safeAddress &&
    proposal.transaction.value === "0" &&
    proposal.transaction.data === "0x" &&
    proposal.transaction.operation === 0;
}

export function canStartSafeProposalRejection(
  proposal: SafeProposalRecord,
): boolean {
  return proposal.purpose !== "rejection" &&
    !proposal.effectClaim &&
    !hasUnresolvedSafeExecution(proposal) &&
    REJECTABLE_STATES.has(proposal.state);
}
