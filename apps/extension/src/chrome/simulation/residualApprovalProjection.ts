import type { AllowanceState } from "./approvalProjection";
import {
  allowancePairKey,
  type AllowancePair,
} from "./approvalAllowanceState";
import type { ResidualApprovalCandidate } from "./residualApprovalCandidates";
import type { ResidualApproval } from "./types";

export function projectResidualApprovals(
  candidates: ResidualApprovalCandidate[],
  preStates: Map<string, AllowanceState | null>,
  finalStates: Map<string, AllowanceState | null>,
): ResidualApproval[] {
  return candidates.flatMap((candidate) => {
    const key = allowancePairKey({
      ...candidate,
      system: "erc20",
    } satisfies AllowancePair);
    const previous = preStates.get(key);
    const remaining = finalStates.get(key);
    if (!previous || !remaining || remaining.amount === 0n) return [];
    return [{
      system: "erc20" as const,
      tokenAddress: candidate.tokenAddress,
      owner: candidate.owner,
      spender: candidate.spender,
      previousAmount: previous.amount.toString(),
      remainingAmount: remaining.amount.toString(),
      sourceCallIndex: candidate.sourceCallIndex,
      evidence: candidate.evidence,
      symbol:
        `${candidate.tokenAddress.slice(0, 6)}...${candidate.tokenAddress.slice(-4)}`,
      name: "",
      decimals: 18,
    }];
  });
}
