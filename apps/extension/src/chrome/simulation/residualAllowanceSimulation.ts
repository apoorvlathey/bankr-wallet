import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  allowancePairKey,
  type AllowancePair,
} from "./approvalAllowanceState";
import type { ApprovalSimulationCall } from "./approvalIntents";
import type { AllowanceState } from "./approvalProjection";
import { BATCH_SIMULATION_GAS_LIMIT } from "./constants";
import type { ResidualApprovalCandidate } from "./residualApprovalCandidates";
import { ALLOWANCE_BATCH_SIMULATOR_ABI } from "./residualApprovalSimulatorAbis";
import { buildIsolatedSimulatorOverride } from "./simulatorOverride";

export interface ResidualAllowanceSimulation {
  allSuccess: boolean;
  before: Map<string, AllowanceState | null>;
  after: Map<string, AllowanceState | null>;
  incomplete: boolean;
}

function empty(
  candidates: ResidualApprovalCandidate[],
): ResidualAllowanceSimulation {
  const before = new Map<string, AllowanceState | null>();
  const after = new Map<string, AllowanceState | null>();
  for (const candidate of candidates) {
    const key = allowancePairKey({
      system: "erc20",
      ...candidate,
    });
    before.set(key, null);
    after.set(key, null);
  }
  return { allSuccess: false, before, after, incomplete: true };
}

/**
 * Execute and read all candidate allowances in one isolated eth_call. The
 * simulator is installed at the reviewed owner so nested contracts see the
 * same ERC-20 caller identity as the real request.
 */
export async function simulateResidualAllowanceStates(input: {
  client: PublicClient;
  calls: ApprovalSimulationCall[];
  candidates: ResidualApprovalCandidate[];
  ownerAddress: string;
  blockNumber: bigint;
}): Promise<ResidualAllowanceSimulation> {
  if (input.candidates.length === 0) {
    return {
      allSuccess: true,
      before: new Map(),
      after: new Map(),
      incomplete: false,
    };
  }
  let owner: Address;
  let data: Hex;
  try {
    owner = getAddress(input.ownerAddress);
    data = encodeFunctionData({
      abi: ALLOWANCE_BATCH_SIMULATOR_ABI,
      functionName: "simulateBatchAllowances",
      args: [
        input.calls.map((call) => ({
          to: getAddress(call.to ?? ""),
          value: BigInt(call.value ?? "0x0"),
          data: (call.data ?? "0x") as Hex,
        })),
        input.candidates.map((candidate) => ({
          token: candidate.tokenAddress,
          spender: candidate.spender,
        })),
      ],
    });
  } catch {
    return empty(input.candidates);
  }

  try {
    const result = await input.client.call({
      account: owner,
      to: owner,
      data,
      gas: BATCH_SIMULATION_GAS_LIMIT,
      blockNumber: input.blockNumber,
      stateOverride: [
        buildIsolatedSimulatorOverride(owner, 100n * 10n ** 18n),
      ],
    });
    if (!result.data) return empty(input.candidates);
    const [
      allSuccess,
      beforeSuccess,
      beforeAmount,
      afterSuccess,
      afterAmount,
    ] = decodeFunctionResult({
      abi: ALLOWANCE_BATCH_SIMULATOR_ABI,
      functionName: "simulateBatchAllowances",
      data: result.data,
    });
    if (
      beforeSuccess.length !== input.candidates.length ||
      beforeAmount.length !== input.candidates.length ||
      afterSuccess.length !== input.candidates.length ||
      afterAmount.length !== input.candidates.length
    ) {
      return empty(input.candidates);
    }
    const before = new Map<string, AllowanceState | null>();
    const after = new Map<string, AllowanceState | null>();
    input.candidates.forEach((candidate, index) => {
      const pair: AllowancePair = {
        system: "erc20",
        tokenAddress: candidate.tokenAddress,
        owner: candidate.owner,
        spender: candidate.spender,
      };
      const key = allowancePairKey(pair);
      before.set(key, beforeSuccess[index]
        ? { amount: beforeAmount[index], expiration: null }
        : null);
      after.set(key, afterSuccess[index]
        ? { amount: afterAmount[index], expiration: null }
        : null);
    });
    return {
      allSuccess,
      before,
      after,
      incomplete: beforeSuccess.some((success) => !success) ||
        afterSuccess.some((success) => !success),
    };
  } catch {
    return empty(input.candidates);
  }
}
