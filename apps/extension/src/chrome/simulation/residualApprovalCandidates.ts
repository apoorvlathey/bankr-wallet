import {
  decodeAbiParameters,
  getAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

import { MAX_SIMULATION_APPROVAL_CHANGES } from "./constants";
import type { ApprovalSimulationCall } from "./approvalIntents";
import type {
  EthSimulateCallResult,
  EthSimulateLog,
} from "./ethSimulateLogs";

const TRANSFER_TOPIC = keccak256(
  stringToHex("Transfer(address,address,uint256)"),
).toLowerCase();
const APPROVAL_TOPIC = keccak256(
  stringToHex("Approval(address,address,uint256)"),
).toLowerCase();

export interface ResidualApprovalCandidate {
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  sourceCallIndex: number;
  evidence: "approvalEvent" | "callTarget";
}

function topicAddress(topic: string | undefined): Address | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  try {
    return getAddress(`0x${topic.slice(-40)}`);
  } catch {
    return null;
  }
}

function logAddress(log: EthSimulateLog): Address | null {
  try {
    return log.address ? getAddress(log.address) : null;
  } catch {
    return null;
  }
}

function transferAmount(log: EthSimulateLog): bigint | null {
  try {
    return decodeAbiParameters(
      [{ type: "uint256" }],
      (log.data ?? "0x") as Hex,
    )[0];
  } catch {
    return null;
  }
}

function approvalEvent(
  log: EthSimulateLog,
  owner: Address,
): { tokenAddress: Address; spender: Address } | null {
  const topics = log.topics ?? [];
  if (topics[0]?.toLowerCase() !== APPROVAL_TOPIC || topics.length !== 3) {
    return null;
  }
  const tokenAddress = logAddress(log);
  const eventOwner = topicAddress(topics[1]);
  const spender = topicAddress(topics[2]);
  if (
    !tokenAddress ||
    !eventOwner ||
    !spender ||
    eventOwner.toLowerCase() !== owner.toLowerCase()
  ) {
    return null;
  }
  try {
    decodeAbiParameters(
      [{ type: "uint256" }],
      (log.data ?? "0x") as Hex,
    );
    return { tokenAddress, spender };
  } catch {
    return null;
  }
}

function candidateKey(candidate: ResidualApprovalCandidate): string {
  return [
    candidate.tokenAddress.toLowerCase(),
    candidate.owner.toLowerCase(),
    candidate.spender.toLowerCase(),
  ].join(":");
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
): { candidates: ResidualApprovalCandidate[]; incomplete: boolean } {
  let owner: Address;
  try {
    owner = getAddress(ownerAddress);
  } catch {
    return { candidates: [], incomplete: true };
  }

  const outgoingTokens = new Set<string>();
  const callOutgoingTokens = new Map<number, Address[]>();
  const approvalEvents: ResidualApprovalCandidate[] = [];
  let incomplete = callResults.length !== calls.length;

  callResults.forEach((callResult, callIndex) => {
    if (callResult.status !== "0x1") return;
    for (const log of callResult.logs ?? []) {
      const topics = log.topics ?? [];
      const tokenAddress = logAddress(log);
      if (
        tokenAddress &&
        topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
        topics.length === 3 &&
        topicAddress(topics[1])?.toLowerCase() === owner.toLowerCase()
      ) {
        const amount = transferAmount(log);
        if (amount === null) {
          incomplete = true;
          continue;
        }
        if (amount === 0n) continue;
        outgoingTokens.add(tokenAddress.toLowerCase());
        const tokens = callOutgoingTokens.get(callIndex) ?? [];
        if (!tokens.some((token) =>
          token.toLowerCase() === tokenAddress.toLowerCase()
        )) {
          tokens.push(tokenAddress);
          callOutgoingTokens.set(callIndex, tokens);
        }
      }
      const approval = approvalEvent(log, owner);
      if (approval) {
        approvalEvents.push({
          ...approval,
          owner,
          sourceCallIndex: callIndex,
          evidence: "approvalEvent",
        });
      }
    }
  });

  const byKey = new Map<string, ResidualApprovalCandidate>();
  for (const event of approvalEvents) {
    if (!outgoingTokens.has(event.tokenAddress.toLowerCase())) continue;
    byKey.set(candidateKey(event), event);
  }
  for (const [callIndex, tokens] of callOutgoingTokens) {
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
      const key = candidateKey(candidate);
      if (!byKey.has(key)) byKey.set(key, candidate);
    }
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
