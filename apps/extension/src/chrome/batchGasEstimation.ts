/**
 * Sequential gas estimation for non-atomic batch transactions.
 *
 * Problem: Individual eth_estimateGas calls fail for dependent calls
 * (e.g., swap after approve) because each call is simulated independently
 * and doesn't see state changes from prior calls.
 *
 * Solution:
 * 1. Primary: eth_simulateV1 — simulates all calls sequentially, returns gasUsed per call
 * 2. Fallback: estimate call 1 normally via eth_estimateGas, use a generous gas buffer
 *    for dependent calls (on-chain execution is correct due to nonce ordering)
 */

import { createPublicClient, http, type Address } from "viem";
import { getRpcUrl } from "./txHandlers";
import { getNativeCurrencySymbol } from "@/constants/chainRegistry";
import { fetchNativePrice } from "./gasEstimation";
import type { GasEstimate } from "./gasEstimation";

const RPC_TIMEOUT = 15_000;

/** Generous gas limit for dependent calls when we can't estimate accurately */
const DEPENDENT_CALL_GAS_LIMIT = 500_000n;

// ---------------------------------------------------------------------------
// eth_simulateV1 support cache (shared with txSimulation.ts pattern)
// ---------------------------------------------------------------------------

const ethSimV1GasSupport = new Map<number, { supported: boolean; checkedAt: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function isSimV1Supported(chainId: number): boolean | null {
  const cached = ethSimV1GasSupport.get(chainId);
  if (!cached || Date.now() - cached.checkedAt > CACHE_TTL) return null;
  return cached.supported;
}

function setSimV1Support(chainId: number, supported: boolean): void {
  ethSimV1GasSupport.set(chainId, { supported, checkedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface BatchGasCall {
  to: string;
  data: string;
  value: string;
}

/**
 * Estimate gas for a batch of calls where each call may depend on the state
 * changes of prior calls (e.g., approve → swap).
 *
 * Returns one GasEstimate per call.
 */
export async function estimateBatchGasSequential(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
): Promise<GasEstimate[]> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) {
    return Promise.all(calls.map(() => makeFailedEstimate(chainId, "No RPC URL configured")));
  }

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });

  // Fetch fee params + balance + price in parallel with gas estimation
  const [feesResult, balance, nativePriceUsd, nativeCurrencySymbol] = await Promise.all([
    client.estimateFeesPerGas().catch(() => null),
    client.getBalance({ address: fromAddress as Address }).catch(() => 0n),
    fetchNativePrice(chainId),
    getNativeCurrencySymbol(chainId),
  ]);

  const maxFeePerGas = feesResult?.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = feesResult?.maxPriorityFeePerGas ?? 0n;
  const baseFee = maxFeePerGas > maxPriorityFeePerGas
    ? maxFeePerGas - maxPriorityFeePerGas
    : 0n;

  // Try eth_simulateV1 first — accurate sequential gas estimation
  const simV1Result = await tryEthSimulateV1(calls, fromAddress, chainId, rpcUrl);
  if (simV1Result) {
    return simV1Result.map((gasUsed) =>
      buildEstimate(gasUsed, maxFeePerGas, maxPriorityFeePerGas, baseFee, balance, nativePriceUsd, nativeCurrencySymbol, false),
    );
  }

  // Fallback: estimate each call independently.
  // Call 1 (e.g., approve) will estimate correctly.
  // Dependent calls (e.g., swap) may fail — use a generous gas buffer.
  console.log("[batchGas] Falling back to individual estimation with generous buffer");
  const gasResults = await estimateIndividualWithFallback(calls, fromAddress, client);

  return gasResults.map(({ gasLimit, fallbackUsed }) =>
    buildEstimate(gasLimit, maxFeePerGas, maxPriorityFeePerGas, baseFee, balance, nativePriceUsd, nativeCurrencySymbol, fallbackUsed),
  );
}

// ---------------------------------------------------------------------------
// eth_simulateV1 path
// ---------------------------------------------------------------------------

async function tryEthSimulateV1(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
  rpcUrl: string,
): Promise<bigint[] | null> {
  const supported = isSimV1Supported(chainId);
  if (supported === false) return null;

  const simulateCalls = calls.map((call) => ({
    from: fromAddress,
    to: call.to,
    data: call.data || "0x",
    value: call.value && call.value !== "0x0" ? call.value : "0x0",
  }));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_simulateV1",
        params: [
          {
            blockStateCalls: [{
              stateOverrides: {
                [fromAddress]: { balance: "0x56BC75E2D63100000" }, // 100 ETH
              },
              calls: simulateCalls,
            }],
            traceTransfers: false,
            validation: false,
          },
          "latest",
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await response.json();

    if (json.error) {
      const errMsg = (json.error.message || "").toLowerCase();
      if (
        errMsg.includes("method not found") ||
        errMsg.includes("not supported") ||
        errMsg.includes("does not exist") ||
        errMsg.includes("unknown method") ||
        json.error.code === -32601
      ) {
        console.log(`[batchGas] eth_simulateV1 not supported on chain ${chainId}`);
        setSimV1Support(chainId, false);
        return null;
      }
      setSimV1Support(chainId, true);
      console.log("[batchGas] eth_simulateV1 error:", json.error);
      return null;
    }

    setSimV1Support(chainId, true);

    const blockResults = json.result;
    if (!blockResults?.[0]?.calls) return null;

    const callResults = blockResults[0].calls;
    console.log(`[batchGas] eth_simulateV1: ${callResults.length} results`);

    return callResults.map((cr: any) => {
      const gasUsed = cr.gasUsed ? BigInt(cr.gasUsed) : 200_000n;
      // Add 20% buffer
      return (gasUsed * 120n) / 100n;
    });
  } catch (err: any) {
    console.log("[batchGas] eth_simulateV1 fetch error:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Individual estimation fallback
// ---------------------------------------------------------------------------

async function estimateIndividualWithFallback(
  calls: BatchGasCall[],
  fromAddress: string,
  client: ReturnType<typeof createPublicClient>,
): Promise<Array<{ gasLimit: bigint; fallbackUsed: boolean }>> {
  const from = fromAddress as Address;

  return Promise.all(
    calls.map(async (call, i) => {
      const to = call.to as Address;
      const value = call.value && call.value !== "0x0" ? BigInt(call.value) : 0n;
      const data = call.data && call.data !== "0x" ? (call.data as `0x${string}`) : undefined;

      try {
        const gas = await client.estimateGas({ account: from, to, value, data });
        // Add 20% buffer
        return { gasLimit: (gas * 120n) / 100n, fallbackUsed: false };
      } catch {
        // Estimation failed (likely a dependent call) — use generous buffer.
        // On-chain gas will be correct because prior calls execute first (nonce ordering).
        // We flag this so the UI can surface the uncertainty to the user; this matters
        // a lot for force inclusion where the value gets baked into the portal _gasLimit
        // and directly drives L1 burn cost on mainnet.
        console.log(`[batchGas] Call ${i} estimation failed, using ${DEPENDENT_CALL_GAS_LIMIT} buffer (fallback)`);
        return { gasLimit: DEPENDENT_CALL_GAS_LIMIT, fallbackUsed: true };
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEstimate(
  gasLimit: bigint,
  maxFeePerGas: bigint,
  maxPriorityFeePerGas: bigint,
  baseFee: bigint,
  balance: bigint,
  nativePriceUsd: number | null,
  nativeCurrencySymbol: string,
  fallbackUsed: boolean,
): GasEstimate {
  const estimatedCostWei = gasLimit * maxFeePerGas;

  return {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    baseFee: baseFee.toString(),
    estimatedCostWei: estimatedCostWei.toString(),
    nativePriceUsd,
    nativeCurrencySymbol,
    accountBalance: balance.toString(),
    insufficientBalance: balance < estimatedCostWei,
    estimationFailed: false,
    dappProvidedGas: false,
    fallbackUsed,
  };
}

async function makeFailedEstimate(
  chainId: number,
  error: string,
): Promise<GasEstimate> {
  const nativeCurrencySymbol = await getNativeCurrencySymbol(chainId);
  return {
    gasLimit: "200000",
    maxFeePerGas: "0",
    maxPriorityFeePerGas: "0",
    baseFee: "0",
    estimatedCostWei: "0",
    nativePriceUsd: null,
    nativeCurrencySymbol,
    accountBalance: "0",
    insufficientBalance: false,
    estimationFailed: true,
    estimationError: error,
    dappProvidedGas: false,
  };
}
