import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { ERC20_ALLOWANCE_ABI, PERMIT2_ALLOWANCE_ABI } from "./approvalAbis";
import type { ApprovalIntent } from "./approvalIntents";
import type { AllowanceState } from "./approvalProjection";
import {
  MAX_SIMULATION_APPROVAL_CHANGES,
  MULTICALL3_ADDRESS,
  PERMIT2_ADDRESS,
} from "./constants";
import type { ResidualApprovalCandidate } from "./residualApprovalCandidates";

export interface AllowancePair {
  system: "erc20" | "permit2";
  tokenAddress: Address;
  owner: Address;
  spender: Address;
}

export function allowancePairKey(pair: AllowancePair): string {
  return [
    pair.system,
    pair.tokenAddress.toLowerCase(),
    pair.owner.toLowerCase(),
    pair.spender.toLowerCase(),
  ].join(":");
}

export function encodeAllowanceRead(pair: AllowancePair): {
  to: Address;
  data: Hex;
} {
  if (pair.system === "permit2") {
    return {
      to: PERMIT2_ADDRESS,
      data: encodeFunctionData({
        abi: PERMIT2_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [pair.owner, pair.tokenAddress, pair.spender],
      }),
    };
  }
  return {
    to: pair.tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [pair.owner, pair.spender],
    }),
  };
}

export function decodeAllowanceRead(
  pair: AllowancePair,
  data: string | undefined,
): AllowanceState | null {
  if (!data || data === "0x" || !/^0x[0-9a-fA-F]+$/.test(data)) return null;
  try {
    if (pair.system === "permit2") {
      const [amount, expiration] = decodeFunctionResult({
        abi: PERMIT2_ALLOWANCE_ABI,
        functionName: "allowance",
        data: data as Hex,
      });
      return { amount, expiration: Number(expiration) };
    }
    const amount = decodeFunctionResult({
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "allowance",
      data: data as Hex,
    });
    return { amount, expiration: null };
  } catch {
    return null;
  }
}

export async function readAllowancePreStates(
  client: PublicClient,
  pairs: AllowancePair[],
  blockNumber: bigint,
): Promise<Map<string, AllowanceState | null>> {
  const states = new Map<string, AllowanceState | null>();
  if (pairs.length === 0) return states;
  try {
    const results = await client.multicall({
      contracts: pairs.map((pair) =>
        pair.system === "permit2"
          ? {
              address: PERMIT2_ADDRESS,
              abi: PERMIT2_ALLOWANCE_ABI,
              functionName: "allowance" as const,
              args: [pair.owner, pair.tokenAddress, pair.spender] as const,
            }
          : {
              address: pair.tokenAddress,
              abi: ERC20_ALLOWANCE_ABI,
              functionName: "allowance" as const,
              args: [pair.owner, pair.spender] as const,
            }
      ),
      allowFailure: true,
      blockNumber,
      multicallAddress: MULTICALL3_ADDRESS,
    });
    pairs.forEach((pair, index) => {
      const result = results[index];
      if (result?.status !== "success") {
        states.set(allowancePairKey(pair), null);
      } else if (pair.system === "permit2" && Array.isArray(result.result)) {
        states.set(allowancePairKey(pair), {
          amount: result.result[0] as bigint,
          expiration: Number(result.result[1]),
        });
      } else {
        states.set(allowancePairKey(pair), {
          amount: result.result as bigint,
          expiration: null,
        });
      }
    });
  } catch {
    pairs.forEach((pair) => states.set(allowancePairKey(pair), null));
  }
  return states;
}

export function mergeAllowancePairs(
  intents: ApprovalIntent[],
  candidates: ResidualApprovalCandidate[],
): { pairs: AllowancePair[]; incomplete: boolean } {
  const pairs = new Map<string, AllowancePair>();
  for (const pair of [...intents, ...candidates]) {
    const normalized: AllowancePair = {
      system: "system" in pair ? pair.system : "erc20",
      tokenAddress: pair.tokenAddress,
      owner: pair.owner,
      spender: pair.spender,
    };
    pairs.set(allowancePairKey(normalized), normalized);
  }
  return {
    pairs: [...pairs.values()].slice(0, MAX_SIMULATION_APPROVAL_CHANGES),
    incomplete: pairs.size > MAX_SIMULATION_APPROVAL_CHANGES,
  };
}
