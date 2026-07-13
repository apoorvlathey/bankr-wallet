import { fetchRpcEnvelope } from "../network/rpcClient";
import type { BatchGasCall, RawBatchGasResult } from "./types";

const RPC_TIMEOUT = 15_000;
const CACHE_TTL = 10 * 60 * 1000;
const supportCache = new Map<
  number,
  { supported: boolean; checkedAt: number }
>();

function getCachedSupport(chainId: number): boolean | null {
  const cached = supportCache.get(chainId);
  if (!cached || Date.now() - cached.checkedAt > CACHE_TTL) return null;
  return cached.supported;
}

function setCachedSupport(chainId: number, supported: boolean): void {
  supportCache.set(chainId, { supported, checkedAt: Date.now() });
}

export async function tryEthSimulateV1(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
  rpcUrl: string,
): Promise<RawBatchGasResult[] | null> {
  if (getCachedSupport(chainId) === false) return null;
  const simulateCalls = calls.map((call) => ({
    from: fromAddress,
    to: call.to,
    data: call.data || "0x",
    value: call.value && call.value !== "0x0" ? call.value : "0x0",
  }));
  try {
    const json = await fetchRpcEnvelope(
      rpcUrl,
      "eth_simulateV1",
      [
        {
          blockStateCalls: [
            {
              stateOverrides: {
                [fromAddress]: { balance: "0x56BC75E2D63100000" },
              },
              calls: simulateCalls,
            },
          ],
          traceTransfers: false,
          validation: false,
        },
        "latest",
      ],
      { timeoutMs: RPC_TIMEOUT, allowPrivateWithoutOrigin: true },
    );
    if (json.error) {
      const rpcError = json.error as Record<string, unknown>;
      const message = String(rpcError.message || "").toLowerCase();
      if (
        message.includes("method not found") ||
        message.includes("not supported") ||
        message.includes("does not exist") ||
        message.includes("unknown method") ||
        rpcError.code === -32601
      ) {
        console.log(
          `[batchGas] eth_simulateV1 not supported on chain ${chainId}`,
        );
        setCachedSupport(chainId, false);
        return null;
      }
      setCachedSupport(chainId, true);
      console.log(
        "[batchGas] eth_simulateV1 returned error, falling through to tier 2:",
        JSON.stringify(rpcError),
      );
      return null;
    }
    setCachedSupport(chainId, true);
    const blockResults = json.result as any;
    if (!blockResults?.[0]?.calls) return null;
    const callResults = blockResults[0].calls;
    console.log(`[batchGas] eth_simulateV1: ${callResults.length} results`);
    const anyReverted = callResults.some(
      (result: any) =>
        result.status !== undefined && result.status !== "0x1",
    );
    if (anyReverted) {
      console.log(
        "[batchGas] eth_simulateV1 reported a call revert — falling through to tier 2 (bytecode injection) for accurate successful-path gas",
      );
      return null;
    }
    return callResults.map((result: any) => {
      if (!result.gasUsed) {
        console.log(
          "[batchGas] eth_simulateV1 returned no gasUsed, using 200k fallback",
        );
        return { gasLimit: 200_000n, fallbackUsed: true };
      }
      return { gasLimit: BigInt(result.gasUsed) * 2n, fallbackUsed: false };
    });
  } catch (error: any) {
    console.log("[batchGas] eth_simulateV1 fetch error:", error.message);
    return null;
  }
}
