import { terminalizeReplacedSafeRoute } from "./executionSettlement";
import { isFutureSafeNonceError } from "./proposalNonce";
import { getSafeProposals, updateSafeProposal } from "./proposalRepository";
import type { SafeProposalRecord } from "./types";

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
    proposal.state === "blocked" &&
    isFutureSafeNonceError(proposal.error) &&
    BigInt(proposal.transaction.nonce) <= liveNonce,
  );
  for (const proposal of queued) {
    const replaced = BigInt(proposal.transaction.nonce) < liveNonce;
    const updated = await updateSafeProposal(proposal.id, (current) => ({
      ...current,
      state: replaced ? "replaced" : activeState(current, input.threshold),
      error: replaced
        ? "Another proposal at this Safe nonce executed"
        : undefined,
      updatedAt: Date.now(),
    }));
    if (replaced) {
      await terminalizeReplacedSafeRoute(
        updated,
        "Another Safe transaction at this nonce executed",
      );
    }
  }
}
