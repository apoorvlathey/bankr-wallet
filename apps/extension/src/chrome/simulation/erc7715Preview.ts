import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";

import { parseTransferCalldata } from "@/lib/erc20Transfer";
import { ERC7710_DELEGATION_MANAGER } from "../erc7715/caveats";
import { buildSimulationResult } from "./resultBuilder";
import type {
  RawSimulationResult as RawSimResult,
  SimulationResult,
} from "./types";

/** `redeemDelegations(bytes[],bytes32[],bytes[])` on MetaMask's DelegationManager. */
const ERC7715_REDEEM_DELEGATIONS_SELECTOR = "0xcef6d209";
const ERC7715_SINGLE_DEFAULT_EXECUTION_MODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ERC7715_BATCH_DEFAULT_EXECUTION_MODE =
  "0x0100000000000000000000000000000000000000000000000000000000000000";

const ERC7715_REDEEM_DELEGATIONS_ABI = [
  {
    type: "function" as const,
    name: "redeemDelegations" as const,
    inputs: [
      { name: "_permissionContexts", type: "bytes[]" as const },
      { name: "_modes", type: "bytes32[]" as const },
      { name: "_executionCallDatas", type: "bytes[]" as const },
    ],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
] as const;

const ERC7715_BATCH_EXECUTION_ABI = [
  {
    name: "executions" as const,
    type: "tuple[]" as const,
    components: [
      { name: "target", type: "address" as const },
      { name: "value", type: "uint256" as const },
      { name: "callData", type: "bytes" as const },
    ],
  },
] as const;

const ERC7715_DELEGATION_CONTEXT_ABI = [
  {
    name: "delegations" as const,
    type: "tuple[]" as const,
    components: [
      { name: "delegate", type: "address" as const },
      { name: "delegator", type: "address" as const },
      { name: "authority", type: "bytes32" as const },
      {
        name: "caveats",
        type: "tuple[]" as const,
        components: [
          { name: "enforcer", type: "address" as const },
          { name: "terms", type: "bytes" as const },
          { name: "args", type: "bytes" as const },
        ],
      },
      { name: "salt", type: "uint256" as const },
      { name: "signature", type: "bytes" as const },
    ],
  },
] as const;

export function isErc7715RedeemDelegationsTx(
  to: Address,
  data: `0x${string}`,
): boolean {
  return (
    to.toLowerCase() === ERC7710_DELEGATION_MANAGER.toLowerCase() &&
    data.toLowerCase().startsWith(ERC7715_REDEEM_DELEGATIONS_SELECTOR)
  );
}

interface Erc7715SingleExecution {
  target: Address;
  value: bigint;
  callData: `0x${string}`;
}

function decodeErc7715SingleExecution(
  executionCallData: `0x${string}`,
): Erc7715SingleExecution | null {
  const hex = executionCallData.slice(2);
  // Packed single execution is address(20) + uint256 value(32) + bytes calldata.
  if (hex.length < 104 || hex.length % 2 !== 0) return null;

  try {
    return {
      target: getAddress(`0x${hex.slice(0, 40)}`),
      value: BigInt(`0x${hex.slice(40, 104)}`),
      callData: `0x${hex.slice(104)}` as `0x${string}`,
    };
  } catch {
    return null;
  }
}

function decodeErc7715BatchExecution(
  executionCallData: `0x${string}`,
): Erc7715SingleExecution[] | null {
  try {
    const [executions] = decodeAbiParameters(
      ERC7715_BATCH_EXECUTION_ABI,
      executionCallData,
    );
    if (!Array.isArray(executions) || executions.length === 0) return null;
    return executions.map((execution) => ({
      target: getAddress(execution.target),
      value: execution.value,
      callData: execution.callData,
    }));
  } catch {
    return null;
  }
}

function decodeErc7715Executions(
  mode: `0x${string}`,
  executionCallData: `0x${string}`,
): Erc7715SingleExecution[] | null {
  const normalizedMode = mode.toLowerCase();
  if (normalizedMode === ERC7715_SINGLE_DEFAULT_EXECUTION_MODE) {
    const execution = decodeErc7715SingleExecution(executionCallData);
    return execution ? [execution] : null;
  }
  if (normalizedMode === ERC7715_BATCH_DEFAULT_EXECUTION_MODE) {
    return decodeErc7715BatchExecution(executionCallData);
  }
  return null;
}

function decodeErc7715Delegator(
  permissionContext: `0x${string}`,
): Address | null {
  try {
    const [delegations] = decodeAbiParameters(
      ERC7715_DELEGATION_CONTEXT_ABI,
      permissionContext,
    );
    const [delegation] = delegations;
    return delegation ? getAddress(delegation.delegator) : null;
  } catch {
    return null;
  }
}

function addTokenDelta(
  tokenDeltas: Map<string, { token: Address; delta: bigint }>,
  token: Address,
  delta: bigint,
) {
  if (delta === 0n) return;
  const key = token.toLowerCase();
  const existing = tokenDeltas.get(key);
  const nextDelta = (existing?.delta ?? 0n) + delta;
  if (nextDelta === 0n) {
    tokenDeltas.delete(key);
    return;
  }
  tokenDeltas.set(key, { token: existing?.token ?? token, delta: nextDelta });
}

export async function buildErc7715RedeemDecodedResult(
  client: PublicClient,
  chainId: number,
  accountAddress: string,
  data: `0x${string}`,
  outerValue: bigint,
): Promise<SimulationResult | null> {
  let permissionContexts: readonly `0x${string}`[];
  let modes: readonly `0x${string}`[];
  let executionCallDatas: readonly `0x${string}`[];

  // MetaMask's Gator redemption wrapper carries native value inside the
  // execution payload and sends the outer DelegationManager tx with value 0.
  // A non-zero outer value can change net native flow in ways this decoder
  // cannot prove without running the full call, so keep the unavailable banner.
  if (outerValue !== 0n) return null;

  try {
    const decoded = decodeFunctionData({
      abi: ERC7715_REDEEM_DELEGATIONS_ABI,
      data,
    });
    [permissionContexts, modes, executionCallDatas] = decoded.args;
  } catch {
    return null;
  }

  if (
    permissionContexts.length !== modes.length ||
    modes.length !== executionCallDatas.length
  ) {
    return null;
  }

  let ethDelta = 0n;
  const tokenDeltas = new Map<string, { token: Address; delta: bigint }>();
  let metadataAccountAddress = accountAddress;

  for (let i = 0; i < executionCallDatas.length; i++) {
    const executions = decodeErc7715Executions(modes[i], executionCallDatas[i]);
    if (!executions) return null;

    const owner = decodeErc7715Delegator(permissionContexts[i]);
    if (!owner) return null;
    if (i === 0) metadataAccountAddress = owner;
    const ownerKey = owner.toLowerCase();

    for (const execution of executions) {
      if (execution.value > 0n) {
        if (execution.target.toLowerCase() === ownerKey) return null;
        ethDelta -= execution.value;
      }

      if (execution.callData === "0x") continue;

      const transfer = parseTransferCalldata(execution.callData);
      if (!transfer) {
        // Unknown calldata can hide arbitrary token movement. Keep the generic
        // unavailable warning instead of showing a partial or misleading preview.
        return null;
      }

      if (transfer.amount === 0n) continue;
      if (transfer.recipient.toLowerCase() === ownerKey) return null;
      addTokenDelta(tokenDeltas, execution.target, -transfer.amount);
    }
  }

  const raw: RawSimResult = {
    txSuccess: true,
    ethDelta,
    tokens: Array.from(tokenDeltas.values()).map((entry) => entry.token),
    deltas: Array.from(tokenDeltas.values()).map((entry) => entry.delta),
    nftsReceived: [],
  };

  return await buildSimulationResult(client, chainId, metadataAccountAddress, raw);
}
