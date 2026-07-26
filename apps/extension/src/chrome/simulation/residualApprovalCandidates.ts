import { getAddress, type Address } from "viem";

import { MAX_SIMULATION_APPROVAL_CHANGES } from "./constants";
import type { ApprovalSimulationCall } from "./approvalIntents";
import type { EthSimulateCallResult } from "./ethSimulateLogs";
import { discoverResidualApprovalLogEvidence } from "./residualApprovalLogEvidence";
import type { TracedResidualApprovalCandidate } from "./residualApprovalTrace";

export interface ResidualApprovalCandidate {
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  sourceCallIndex: number;
  evidence: "transferFromTrace" | "approvalEvent" | "callTarget";
}

function candidateKey(candidate: ResidualApprovalCandidate): string {
  return [
    candidate.tokenAddress.toLowerCase(),
    candidate.owner.toLowerCase(),
    candidate.spender.toLowerCase(),
  ].join(":");
}

function evidencePriority(
  evidence: ResidualApprovalCandidate["evidence"],
): number {
  if (evidence === "transferFromTrace") return 3;
  if (evidence === "approvalEvent") return 2;
  return 1;
}

function retainStrongestCandidate(
  byKey: Map<string, ResidualApprovalCandidate>,
  candidate: ResidualApprovalCandidate,
): void {
  const key = candidateKey(candidate);
  const previous = byKey.get(key);
  if (
    !previous ||
    evidencePriority(candidate.evidence) > evidencePriority(previous.evidence)
  ) {
    byKey.set(key, candidate);
  }
}

/**
 * Build a bounded candidate set without another trace. Approval events provide
 * the exact ERC-20 spender when available; the successful top-level call
 * target is retained as a bounded fallback. Its final allowance is still read
 * and must be non-zero, which also covers unlimited allowances that do not
 * decrement or emit Approval during transferFrom.
 */
export function discoverResidualApprovalCandidates(
  calls: ApprovalSimulationCall[],
  callResults: EthSimulateCallResult[],
  ownerAddress: string,
  tracedCandidates: TracedResidualApprovalCandidate[] = [],
): { candidates: ResidualApprovalCandidate[]; incomplete: boolean } {
  let owner: Address;
  try {
    owner = getAddress(ownerAddress);
  } catch {
    return { candidates: [], incomplete: true };
  }

  const logEvidence = discoverResidualApprovalLogEvidence(
    callResults,
    calls.length,
    owner,
  );
  let incomplete = logEvidence.incomplete;

  const byKey = new Map<string, ResidualApprovalCandidate>();
  for (const event of logEvidence.approvalEvents) {
    if (!logEvidence.outgoingTokens.has(event.tokenAddress.toLowerCase())) {
      continue;
    }
    retainStrongestCandidate(byKey, {
      ...event,
      owner,
      evidence: "approvalEvent",
    });
  }
  for (const [callIndex, tokens] of logEvidence.callOutgoingTokens) {
    const target = calls[callIndex]?.to;
    if (!target) continue;
    let spender: Address;
    try {
      spender = getAddress(target);
    } catch {
      incomplete = true;
      continue;
    }
    for (const tokenAddress of tokens) {
      const candidate: ResidualApprovalCandidate = {
        tokenAddress,
        owner,
        spender,
        sourceCallIndex: callIndex,
        evidence: "callTarget",
      };
      retainStrongestCandidate(byKey, candidate);
    }
  }
  for (const traced of tracedCandidates) {
    retainStrongestCandidate(byKey, traced);
  }

  return {
    candidates: [...byKey.values()].slice(
      0,
      MAX_SIMULATION_APPROVAL_CHANGES,
    ),
    incomplete:
      incomplete || byKey.size > MAX_SIMULATION_APPROVAL_CHANGES,
  };
}
