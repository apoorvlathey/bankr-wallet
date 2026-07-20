import type { SafeProposalRecord } from "./types";

/**
 * Durable evidence wins over a stale display state. Once an outer execution
 * has been claimed, prepared, or hashed, no code path may prepare another one.
 */
export function hasUnresolvedSafeExecution(
  proposal: Pick<
    SafeProposalRecord,
    "state" | "transactionHash" | "serializedExecution" | "effectClaim"
  >,
): boolean {
  return proposal.state === "executing" ||
    !!proposal.transactionHash ||
    !!proposal.serializedExecution ||
    proposal.effectClaim?.kind === "execute";
}
