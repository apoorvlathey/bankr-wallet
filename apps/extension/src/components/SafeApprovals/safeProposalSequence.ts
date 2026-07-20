import type { SafeProposalRecord } from "@/chrome/safe/types";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";

/**
 * Returns the Safe nonce that must run before a future-nonce
 * proposal. Other blocked states (for example, a changed Safe configuration)
 * deliberately do not receive sequencing copy.
 */
export function getSafeProposalBlockingNonce(
  proposal: SafeProposalRecord,
  orderedProposals: readonly SafeProposalRecord[],
): number | undefined {
  if (
    proposal.state !== "blocked" ||
    !proposal.error?.startsWith("Future Safe nonce ")
  ) {
    return undefined;
  }

  let blockerNonce: number | undefined;

  orderedProposals.forEach((candidate) => {
    if (
      candidate.id === proposal.id ||
      candidate.safeAccountId !== proposal.safeAccountId ||
      candidate.chainId !== proposal.chainId ||
      candidate.transaction.nonce >= proposal.transaction.nonce ||
      !isPendingSafeProposal(candidate)
    ) {
      return;
    }

    if (blockerNonce === undefined || candidate.transaction.nonce < blockerNonce) {
      blockerNonce = candidate.transaction.nonce;
    }
  });

  return blockerNonce;
}
