import type { Address, PublicClient } from "viem";
import type { BatchGasCall, RawBatchGasResult } from "./types";

const DEPENDENT_CALL_GAS_LIMIT = 500_000n;

export async function estimateIndividualWithFallback(
  calls: BatchGasCall[],
  fromAddress: string,
  client: PublicClient,
): Promise<RawBatchGasResult[]> {
  const from = fromAddress as Address;
  return Promise.all(
    calls.map(async (call, index) => {
      const value =
        call.value && call.value !== "0x0" ? BigInt(call.value) : 0n;
      const data =
        call.data && call.data !== "0x"
          ? (call.data as `0x${string}`)
          : undefined;
      try {
        const gas = await client.estimateGas({
          account: from,
          to: call.to as Address,
          value,
          data,
        });
        return { gasLimit: (gas * 120n) / 100n, fallbackUsed: false };
      } catch {
        console.log(
          `[batchGas] Call ${index} estimation failed, using ${DEPENDENT_CALL_GAS_LIMIT} buffer (fallback)`,
        );
        return { gasLimit: DEPENDENT_CALL_GAS_LIMIT, fallbackUsed: true };
      }
    }),
  );
}
