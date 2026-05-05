/**
 * Sequential gas estimation for non-atomic batch transactions.
 *
 * Problem: Individual eth_estimateGas calls fail for dependent calls
 * (e.g., swap after approve) because each call is simulated independently
 * and doesn't see state changes from prior calls.
 *
 * Solution (3 tiers, fall through on failure):
 * 1. eth_simulateV1 — when supported, simulates all calls sequentially in one
 *    RPC call and returns gasUsed per call. State persists between calls.
 * 2. TxSimulator bytecode injection — universal fallback. Injects the
 *    TxSimulator.sol runtime bytecode at the user's address via eth_call
 *    state override and runs simulateBatchGas() which executes calls
 *    sequentially (state persists, msg.sender == user) and measures gas
 *    via gasleft() per call (intrinsic + calldata cost added in-contract).
 *    Works on any chain that supports eth_call state overrides (Berlin+).
 * 3. Individual estimateGas with 500k buffer — last-resort fallback if
 *    bytecode injection itself fails. Surfaces fallbackUsed=true so the UI
 *    can warn the user and offer per-row editing.
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionResult,
  type Address,
} from "viem";
import { getRpcUrl } from "./txHandlers";
import { getNativeCurrencySymbol, CHAIN_REGISTRY } from "@/constants/chainRegistry";

const CHAIN_BY_ID_BATCH = new Map(CHAIN_REGISTRY.map((c) => [c.chainId, c]));
import { fetchNativePrice } from "./gasEstimation";
import type { GasEstimate, GasEstimateTiers } from "./gasEstimation";
import { estimateFees } from "./feeEstimation";
import { SIMULATOR_BYTECODE } from "./txSimulation";

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

  // Log resolved RPC host (without API key) so we can confirm which provider
  // is being used when debugging the gas estimation path.
  try {
    const host = new URL(rpcUrl).host;
    console.log(`[batchGas] chainId=${chainId} rpcHost=${host} calls=${calls.length}`);
  } catch {
    // ignore URL parse failures
  }

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });

  // Fetch fee params + balance + price in parallel with gas estimation.
  // Uses feeHistory-based estimator with per-chain priority fee floors —
  // see feeEstimation.ts for the rationale.
  const [feesResult, balance, nativePriceUsd, nativeCurrencySymbol] = await Promise.all([
    estimateFees(client, chainId).catch(() => null),
    client.getBalance({ address: fromAddress as Address }).catch(() => 0n),
    fetchNativePrice(chainId),
    getNativeCurrencySymbol(chainId),
  ]);

  const maxFeePerGas = feesResult?.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = feesResult?.maxPriorityFeePerGas ?? 0n;
  const baseFee = feesResult?.baseFee ?? 0n;

  // Serialize tiers once so every per-call estimate carries the same picker
  // data. Wei strings to keep the GasEstimate JSON-safe over chrome.runtime.
  const tiers: GasEstimateTiers | undefined = feesResult?.tiers
    ? {
        slow: {
          maxFeePerGas: feesResult.tiers.slow.maxFeePerGas.toString(),
          maxPriorityFeePerGas:
            feesResult.tiers.slow.maxPriorityFeePerGas.toString(),
        },
        standard: {
          maxFeePerGas: feesResult.tiers.standard.maxFeePerGas.toString(),
          maxPriorityFeePerGas:
            feesResult.tiers.standard.maxPriorityFeePerGas.toString(),
        },
        fast: {
          maxFeePerGas: feesResult.tiers.fast.maxFeePerGas.toString(),
          maxPriorityFeePerGas:
            feesResult.tiers.fast.maxPriorityFeePerGas.toString(),
        },
      }
    : undefined;
  const predictedNextBaseFee = feesResult?.predictedNextBaseFee?.toString();

  // Chains with a non-standard gas model (MegaETH) skip both simulation tiers
  // and go straight to per-call eth_estimateGas, which the chain's RPC computes
  // using its own (correct) gas accounting. Tier 1's eth_simulateV1 isn't
  // supported there anyway, and tier 2's bytecode injection counts gas via the
  // GAS opcode — only compute gas, not MegaETH's separate storage gas dimension
  // — so it systematically under-estimates SSTORE-heavy ops like ERC20 approve.
  const nonStandardGas = CHAIN_BY_ID_BATCH.get(chainId)?.usesNonStandardGasModel;

  if (!nonStandardGas) {
    // Tier 1: eth_simulateV1 — fastest path on supported RPCs (Geth 1.14.9+, Alchemy)
    const simV1Result = await tryEthSimulateV1(calls, fromAddress, chainId, rpcUrl);
    if (simV1Result) {
      return simV1Result.map(({ gasLimit, fallbackUsed }) =>
        buildEstimate(gasLimit, maxFeePerGas, maxPriorityFeePerGas, baseFee, balance, nativePriceUsd, nativeCurrencySymbol, fallbackUsed, tiers, predictedNextBaseFee),
      );
    }

    // Tier 2: TxSimulator bytecode injection — universal sequential simulation.
    // Works on any chain that supports eth_call state overrides. Runs all calls
    // sequentially in one eth_call so dependent calls (swap-after-approve) see
    // the prior call's state and estimate correctly.
    const injectionResult = await tryBatchGasInjection(calls, fromAddress, chainId, rpcUrl);
    if (injectionResult) {
      return injectionResult.map(({ gasLimit, fallbackUsed }) =>
        buildEstimate(gasLimit, maxFeePerGas, maxPriorityFeePerGas, baseFee, balance, nativePriceUsd, nativeCurrencySymbol, fallbackUsed, tiers, predictedNextBaseFee),
      );
    }
  }

  // Tier 3 (last resort): estimate each call independently with hardcoded buffer.
  // Should be very rare — only hits when both eth_simulateV1 AND bytecode injection
  // fail (e.g., a chain that supports neither, which is essentially nothing modern).
  console.log("[batchGas] Falling back to individual estimation with generous buffer");
  const gasResults = await estimateIndividualWithFallback(calls, fromAddress, client);

  return gasResults.map(({ gasLimit, fallbackUsed }) =>
    buildEstimate(gasLimit, maxFeePerGas, maxPriorityFeePerGas, baseFee, balance, nativePriceUsd, nativeCurrencySymbol, fallbackUsed, tiers, predictedNextBaseFee),
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
): Promise<Array<{ gasLimit: bigint; fallbackUsed: boolean }> | null> {
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
      // RPC supports the method but rejected this specific call. Cache as
      // supported (so we don't keep retrying on every batch) but fall through
      // to tier 2. Log the full error payload so we can diagnose what went
      // wrong (often a quirk in how a specific call decodes inside the sim).
      setSimV1Support(chainId, true);
      console.log("[batchGas] eth_simulateV1 returned error, falling through to tier 2:", JSON.stringify(json.error));
      return null;
    }

    setSimV1Support(chainId, true);

    const blockResults = json.result;
    if (!blockResults?.[0]?.calls) return null;

    const callResults = blockResults[0].calls;
    console.log(`[batchGas] eth_simulateV1: ${callResults.length} results`);

    return callResults.map((cr: any) => {
      // If gasUsed is missing on a call result (shouldn't normally happen),
      // fall back to 200k and surface the uncertainty via fallbackUsed so the
      // UI warns the user. This matters most for force inclusion where the
      // value is baked into the portal _gasLimit and drives L1 burn cost.
      if (!cr.gasUsed) {
        console.log("[batchGas] eth_simulateV1 returned no gasUsed, using 200k fallback");
        return { gasLimit: 200_000n, fallbackUsed: true };
      }
      const gasUsed = BigInt(cr.gasUsed);
      // Add 20% buffer
      return { gasLimit: (gasUsed * 120n) / 100n, fallbackUsed: false };
    });
  } catch (err: any) {
    console.log("[batchGas] eth_simulateV1 fetch error:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 2: TxSimulator bytecode injection
// ---------------------------------------------------------------------------

/**
 * ABI for TxSimulator.simulateBatchGas — runs all calls sequentially in one
 * eth_call (state persists between calls), returns per-call gas including
 * intrinsic + calldata cost so the value is usable directly as a tx gas limit
 * after applying a buffer.
 */
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

/**
 * Inject TxSimulator runtime bytecode at the user's address via eth_call state
 * override and run simulateBatchGas() — gives accurate per-call gas for
 * dependent batches on any chain that supports eth_call state overrides.
 */
async function tryBatchGasInjection(
  calls: BatchGasCall[],
  fromAddress: string,
  chainId: number,
  rpcUrl: string,
): Promise<Array<{ gasLimit: bigint; fallbackUsed: boolean }> | null> {
  try {
    const client = createPublicClient({
      transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
    });

    const encodedCalls = calls.map((c) => ({
      to: c.to as Address,
      value: c.value && c.value !== "0x0" ? BigInt(c.value) : 0n,
      data: ((c.data && c.data !== "0x") ? c.data : "0x") as `0x${string}`,
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
        {
          address: fromAddress as Address,
          code: SIMULATOR_BYTECODE,
        },
      ],
    });

    if (!result.data) {
      console.log(`[batchGas] tier-2 injection: empty response on chain ${chainId}`);
      return null;
    }

    const decoded = decodeFunctionResult({
      abi: SIMULATE_BATCH_GAS_ABI,
      functionName: "simulateBatchGas",
      data: result.data,
    });

    // viem returns the outputs as a tuple [allSuccess, gasUsedPerCall]
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

    // Apply 20% buffer (same as the other paths). gasUsedPerCall already
    // includes intrinsic (21000) + calldata cost from the contract side.
    return gasUsedPerCall.map((gas) => ({
      gasLimit: (gas * 120n) / 100n,
      fallbackUsed: false,
    }));
  } catch (err: any) {
    // Bytecode injection failures usually mean the chain doesn't support
    // state overrides on eth_call (extremely rare on modern chains) or the
    // RPC is rejecting our request shape. Log and let tier 3 take over.
    console.log(`[batchGas] tier-2 injection failed on chain ${chainId}:`, err?.message || err);
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
  tiers: GasEstimateTiers | undefined,
  predictedNextBaseFee: string | undefined,
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
    tiers,
    predictedNextBaseFee,
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
