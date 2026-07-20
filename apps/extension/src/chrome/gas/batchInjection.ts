import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
} from "viem";
import { secureHttpTransport } from "../network/rpcClient";
import { buildIsolatedSimulatorOverride } from "../simulation/simulatorOverride";
import type { BatchGasCall, RawBatchGasResult } from "./types";

const RPC_TIMEOUT = 15_000;
const SIMULATE_BATCH_GAS_ABI = [
  {
    type: "function" as const,
    name: "simulateBatchGas" as const,
    inputs: [
      {
        name: "calls",
        type: "tuple[]" as const,
        components: [
          { name: "to", type: "address" as const },
          { name: "value", type: "uint256" as const },
          { name: "data", type: "bytes" as const },
        ],
      },
    ],
    outputs: [
      { name: "allSuccess", type: "bool" as const },
      { name: "gasUsedPerCall", type: "uint256[]" as const },
    ],
    stateMutability: "nonpayable" as const,
  },
] as const;

export async function tryBatchGasInjection(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
  rpcUrl: string,
): Promise<RawBatchGasResult[] | null> {
  try {
    const client = createPublicClient({
      transport: secureHttpTransport(rpcUrl, {
        timeout: RPC_TIMEOUT,
        retryCount: 1,
      }),
    });
    const encodedCalls = calls.map((call) => ({
      to: call.to as Address,
      value:
        call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
    }));
    const calldata = encodeFunctionData({
      abi: SIMULATE_BATCH_GAS_ABI,
      functionName: "simulateBatchGas",
      args: [encodedCalls],
    });
    const result = await client.call({
      account: fromAddress as Address,
      to: fromAddress as Address,
      data: calldata,
      stateOverride: [
        buildIsolatedSimulatorOverride(fromAddress as Address),
      ],
    });
    if (!result.data) {
      console.log(
        `[batchGas] tier-2 injection: empty response on chain ${chainId}`,
      );
      return null;
    }
    const decoded = decodeFunctionResult({
      abi: SIMULATE_BATCH_GAS_ABI,
      functionName: "simulateBatchGas",
      data: result.data,
    });
    const [allSuccess, gasUsedPerCall] = decoded as unknown as [
      boolean,
      readonly bigint[],
    ];
    if (gasUsedPerCall.length !== calls.length) {
      console.log(
        `[batchGas] tier-2 injection: result length mismatch (${gasUsedPerCall.length} vs ${calls.length})`,
      );
      return null;
    }
    console.log(
      `[batchGas] tier-2 injection ok (allSuccess=${allSuccess}): [${gasUsedPerCall.map(String).join(", ")}]`,
    );
    return gasUsedPerCall.map((gas) => ({
      gasLimit: gas * 2n,
      fallbackUsed: false,
    }));
  } catch (error: any) {
    console.log(
      `[batchGas] tier-2 injection failed on chain ${chainId}:`,
      error?.message || error,
    );
    return null;
  }
}
