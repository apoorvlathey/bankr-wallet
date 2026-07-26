import type { SafeProposalRecord } from "@/chrome/safe/types";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";
import {
  getSafeProposalNoncePosition,
  isFutureSafeNonceError,
} from "@/chrome/safe/proposalNonce";

/**
 * Returns the first Safe nonce that must run before a queued proposal.
 * Configuration-blocked records deliberately do not receive sequencing copy.
 */
export function getSafeProposalBlockingNonce(
  proposal: SafeProposalRecord,
  orderedProposals: readonly SafeProposalRecord[],
  liveNonce?: `${bigint}`,
): number | undefined {
  if (
    proposal.state === "blocked" &&
    !isFutureSafeNonceError(proposal.error)
  ) {
    return undefined;
  }

  let blockerNonce = liveNonce !== undefined &&
      getSafeProposalNoncePosition(proposal.transaction.nonce, liveNonce) === "future"
    ? Number(liveNonce)
    : undefined;

  orderedProposals.forEach((candidate) => {
    if (
      candidate.id === proposal.id ||
      candidate.safeAccountId !== proposal.safeAccountId ||
      candidate.chainId !== proposal.chainId ||
      candidate.transaction.nonce >= proposal.transaction.nonce ||
      (liveNonce !== undefined &&
        BigInt(candidate.transaction.nonce) < BigInt(liveNonce)) ||
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
