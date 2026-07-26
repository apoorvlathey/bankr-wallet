import {
  decodeAbiParameters,
  getAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

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

function decodedAmount(log: EthSimulateLog): bigint | null {
  try {
    return decodeAbiParameters(
      [{ type: "uint256" }],
      (log.data ?? "0x") as Hex,
    )[0];
  } catch {
    return null;
  }
}

export interface ResidualApprovalLogEvidence {
  outgoingTokens: Set<string>;
  callOutgoingTokens: Map<number, Address[]>;
  approvalEvents: Array<{
    tokenAddress: Address;
    spender: Address;
    sourceCallIndex: number;
  }>;
  incomplete: boolean;
}

export function discoverResidualApprovalLogEvidence(
  callResults: EthSimulateCallResult[],
  callCount: number,
  owner: Address,
): ResidualApprovalLogEvidence {
  const outgoingTokens = new Set<string>();
  const callOutgoingTokens = new Map<number, Address[]>();
  const approvalEvents: ResidualApprovalLogEvidence["approvalEvents"] = [];
  let incomplete = callResults.length !== callCount;

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
        const amount = decodedAmount(log);
        if (amount === null) {
          incomplete = true;
        } else if (amount > 0n) {
          outgoingTokens.add(tokenAddress.toLowerCase());
          const tokens = callOutgoingTokens.get(callIndex) ?? [];
          if (
            !tokens.some(
              (token) =>
                token.toLowerCase() === tokenAddress.toLowerCase(),
            )
          ) {
            tokens.push(tokenAddress);
            callOutgoingTokens.set(callIndex, tokens);
          }
        }
      }
      if (
        tokenAddress &&
        topics[0]?.toLowerCase() === APPROVAL_TOPIC &&
        topics.length === 3 &&
        topicAddress(topics[1])?.toLowerCase() === owner.toLowerCase() &&
        decodedAmount(log) !== null
      ) {
        const spender = topicAddress(topics[2]);
        if (spender) {
          approvalEvents.push({ tokenAddress, spender, sourceCallIndex: callIndex });
        }
      }
    }
  });
  return { outgoingTokens, callOutgoingTokens, approvalEvents, incomplete };
}
