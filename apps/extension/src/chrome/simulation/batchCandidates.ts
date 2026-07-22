import {
  encodeAbiParameters,
  encodeFunctionData,
  type AccessList,
  type Address,
  type PublicClient,
} from "viem";

import { extractCalldataAddressCandidates } from "../calldataAddressCandidates";
import { preflightAssetCandidates } from "../erc20CandidatePreflight";
import {
  MAX_SIMULATION_ASSET_CHANGES,
  MULTICALL3_ADDRESS,
  SIMULATION_GAS_LIMIT,
} from "./constants";

export interface BatchSimulationCall {
  to?: string;
  data?: string;
  value?: string;
}

export type BatchCandidateDiscovery = "erc7821" | "directCalls";

const ERC7821_BATCH_MODE =
  "0x0100000000007821000100000000000000000000000000000000000000000000" as const;

function encodeErc7821Batch(calls: BatchSimulationCall[]) {
  const encodedCalls = calls.map((call) => ({
    to: call.to as Address,
    value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
    data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
  }));
  const executionData = encodeAbiParameters(
    [{
      type: "tuple[]",
      components: [
        { type: "address", name: "to" },
        { type: "uint256", name: "value" },
        { type: "bytes", name: "data" },
      ],
    }],
    [encodedCalls],
  );
  return {
    data: encodeFunctionData({
      abi: [{
        inputs: [
          { name: "mode", type: "bytes32" },
          { name: "executionData", type: "bytes" },
        ],
        name: "execute",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      }] as const,
      functionName: "execute",
      args: [ERC7821_BATCH_MODE, executionData],
    }),
    value: encodedCalls.reduce((sum, call) => sum + call.value, 0n),
  };
}

async function discoverDirectCallAccessList(
  client: PublicClient,
  calls: BatchSimulationCall[],
  from: Address,
): Promise<AccessList> {
  const lists = await Promise.all(calls.map((call, index) =>
    client.createAccessList({
      account: from,
      to: call.to as Address,
      value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
      gas: SIMULATION_GAS_LIMIT,
    }).then((result) => {
      console.log(`[batchSim] AccessList call ${index}: ${result.accessList.length} entries`);
      return result.accessList;
    }).catch((error: any) => {
      console.log(
        `[batchSim] AccessList call ${index} FAILED:`,
        error.shortMessage || error.message,
      );
      return [] as AccessList;
    }),
  ));
  return lists.flat();
}

async function discoverAccessList(
  client: PublicClient,
  calls: BatchSimulationCall[],
  from: Address,
  strategy: BatchCandidateDiscovery,
): Promise<AccessList> {
  if (strategy === "directCalls") {
    console.log("[batchSim] Discovering Safe candidates from direct calls...");
    return discoverDirectCallAccessList(client, calls, from);
  }

  try {
    const batch = encodeErc7821Batch(calls);
    const result = await client.createAccessList({
      account: from,
      to: from,
      value: batch.value,
      data: batch.data,
      gas: SIMULATION_GAS_LIMIT,
    });
    console.log(`[batchSim] Full-batch AccessList: ${result.accessList.length} entries`);
    return result.accessList;
  } catch (error: any) {
    console.log(
      `[batchSim] Full-batch AccessList failed (${error.shortMessage || error.message}), falling back to per-call...`,
    );
    return discoverDirectCallAccessList(client, calls, from);
  }
}

export async function discoverBatchAssetCandidates({
  client,
  calls,
  from,
  chainId,
  strategy,
}: {
  client: PublicClient;
  calls: BatchSimulationCall[];
  from: Address;
  chainId: number;
  strategy: BatchCandidateDiscovery;
}): Promise<Address[]> {
  const accessList = await discoverAccessList(client, calls, from, strategy);
  const seen = new Set([from.toLowerCase()]);
  const candidates: Address[] = [];
  const add = (address: Address) => {
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(address);
  };

  if (strategy === "erc7821") {
    // Preserve the established ERC-7821 candidate order and behavior.
    for (const entry of accessList) add(entry.address as Address);
    for (const call of calls) add(call.to as Address);
    return candidates.slice(0, MAX_SIMULATION_ASSET_CHANGES);
  }

  // Direct traces are the only source for dynamically resolved assets (for
  // example Aave receipt tokens), so prioritize them before calldata hints.
  for (const entry of accessList) add(entry.address as Address);
  for (const call of calls) add(call.to as Address);
  for (const call of calls) {
    const data = (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`;
    for (const address of extractCalldataAddressCandidates(data, [from])) add(address);
  }
  return preflightAssetCandidates(
    client,
    chainId,
    from,
    candidates.slice(0, MAX_SIMULATION_ASSET_CHANGES),
    MULTICALL3_ADDRESS,
  );
}
