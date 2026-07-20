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

/** Only an explicit trusted-UI acknowledgement may bypass a failed simulation. */
export function allowsSafeExecutionAfterSimulationFailure(value: unknown): boolean {
  return value === true;
}

export async function enforceSafeExecutionSimulation(
  simulate: () => Promise<void>,
  acknowledgement: unknown,
): Promise<void> {
  try {
    await simulate();
  } catch (error) {
    if (!allowsSafeExecutionAfterSimulationFailure(acknowledgement)) {
      throw error;
    }
  }
}
