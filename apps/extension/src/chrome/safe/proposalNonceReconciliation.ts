import { terminalizeReplacedSafeRoute } from "./executionSettlement";
import { hasUnresolvedSafeExecution } from "./executionPolicy";
import { isFutureSafeNonceError } from "./proposalNonce";
import { getSafeProposals, updateSafeProposal } from "./proposalRepository";
import { isPendingSafeProposal } from "./proposalStatus";
import type { SafeProposalRecord } from "./types";

const APPROVAL_STATES = new Set<SafeProposalRecord["state"]>([
  "draft",
  "approvedLocally",
  "awaitingApprovals",
  "readyToExecute",
]);

function activeState(
  proposal: SafeProposalRecord,
  threshold: number,
): SafeProposalRecord["state"] {
  if (proposal.confirmations.length >= threshold) return "readyToExecute";
  return proposal.confirmations.length > 0 ? "awaitingApprovals" : "draft";
}

/** Advances locally queued future-nonce requests as the Safe nonce changes. */
export async function reconcileSafeProposalNonceQueue(input: {
  safeAccountId: string;
  chainId: number;
  liveNonce: `${bigint}`;
  threshold: number;
}): Promise<void> {
  const liveNonce = BigInt(input.liveNonce);
  const queued = (await getSafeProposals()).filter((proposal) =>
    proposal.safeAccountId === input.safeAccountId &&
    proposal.chainId === input.chainId &&
    isPendingSafeProposal(proposal) &&
    !proposal.effectClaim &&
    !hasUnresolvedSafeExecution(proposal) &&
    BigInt(proposal.transaction.nonce) <= liveNonce,
  );
  for (const proposal of queued) {
    let replaced = false;
    const updated = await updateSafeProposal(proposal.id, (current) => {
      if (
        !isPendingSafeProposal(current) ||
        current.effectClaim ||
        hasUnresolvedSafeExecution(current)
      ) return current;
      const position = BigInt(current.transaction.nonce) - liveNonce;
      if (position > 0n) return current;
      replaced = position < 0n;
      const legacyFutureAtLiveNonce =
        current.state === "blocked" && isFutureSafeNonceError(current.error);
      if (!replaced && !legacyFutureAtLiveNonce && !APPROVAL_STATES.has(current.state)) {
        return current;
      }
      return {
        ...current,
        state: replaced ? "replaced" : activeState(current, input.threshold),
        error: replaced
          ? "Another proposal at this Safe nonce executed"
          : undefined,
        updatedAt: Date.now(),
      };
    });
    if (replaced) {
      await terminalizeReplacedSafeRoute(
        updated,
        "Another Safe transaction at this nonce executed",
      );
    }
  }
}
