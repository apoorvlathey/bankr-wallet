import { fetchRpcEnvelope } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import { buildNativeChange } from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import {
  parseEthSimulateV1CallResults,
  type EthSimulateCallResult,
} from "./ethSimulateLogs";
import { getNativeCurrency } from "./nativeCurrency";
import { getPortfolioPriceMap } from "./portfolioPrices";
import { enrichTokenChanges } from "./tokenEnrichment";
import type { SimulationResult } from "./types";

// ---------------------------------------------------------------------------
// eth_simulateV1 support cache — tracks which chains support the method
// ---------------------------------------------------------------------------

const ethSimulateV1Support = new Map<number, { supported: boolean; checkedAt: number }>();
const SIMULATE_V1_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function isEthSimulateV1Supported(chainId: number): boolean | null {
  const cached = ethSimulateV1Support.get(chainId);
  if (!cached || Date.now() - cached.checkedAt > SIMULATE_V1_CACHE_TTL) return null;
  return cached.supported;
}

function setEthSimulateV1Support(chainId: number, supported: boolean): void {
  ethSimulateV1Support.set(chainId, { supported, checkedAt: Date.now() });
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// eth_simulateV1-based batch simulation (non-atomic EOA accounts)
// ---------------------------------------------------------------------------

/**
 * Simulate multiple calls via eth_simulateV1 (sequential, state-persisting).
 * Returns the same SimulationResult as the bytecode-injection approach.
 *
 * Falls back to null if eth_simulateV1 is not supported (caller should
 * use the existing simulateBatchAssetChanges as fallback).
 */
export async function simulateViaEthSimulateV1(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult | null> {
  // Check cached support status
  const supported = isEthSimulateV1Supported(chainId);
  if (supported === false) return null;

  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const from = fromAddress.toLowerCase();

  // Build eth_simulateV1 request
  const simulateCalls = calls.map((call) => ({
    from: fromAddress,
    to: call.to || "0x0000000000000000000000000000000000000000",
    data: call.data || "0x",
    value: call.value && call.value !== "0x0" ? call.value : "0x0",
  }));

  const requestBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_simulateV1",
    params: [
      {
        blockStateCalls: [
          {
            stateOverrides: {
              [fromAddress]: {
                balance: "0x56BC75E2D63100000", // 100 ETH
              },
            },
            calls: simulateCalls,
          },
        ],
        traceTransfers: true,
        validation: false,
      },
      "latest",
    ],
  };

  try {
    const json = await fetchRpcEnvelope(
      rpcUrl,
      requestBody.method,
      requestBody.params,
      {
        timeoutMs: 15_000,
        allowPrivateWithoutOrigin: true,
      },
    );

    // Check for RPC error (method not found = unsupported)
    if (json.error) {
      const rpcError = json.error as Record<string, unknown>;
      const errMsg = String(rpcError.message || "").toLowerCase();
      if (
        errMsg.includes("method not found") ||
        errMsg.includes("not supported") ||
        errMsg.includes("does not exist") ||
        errMsg.includes("unknown method") ||
        rpcError.code === -32601
      ) {
        console.log(`[ethSimV1] eth_simulateV1 not supported on chain ${chainId}, caching`);
        setEthSimulateV1Support(chainId, false);
        return null;
      }
      // Other errors — method exists but call failed
      console.log(`[ethSimV1] RPC error:`, rpcError);
      setEthSimulateV1Support(chainId, true);
      return null;
    }

    // Success — mark as supported
    setEthSimulateV1Support(chainId, true);

    // Parse the response
    const blockResults = json.result as any;
    if (!blockResults || !Array.isArray(blockResults) || blockResults.length === 0) {
      console.log("[ethSimV1] Empty response");
      return null;
    }

    const blockResult = blockResults[0];
    const callResults = (blockResult.calls || []) as EthSimulateCallResult[];
    console.log(`[ethSimV1] Got ${callResults.length} call results`);
    const {
      allSuccess,
      nativeDelta,
      tokens: nonZeroTokens,
      deltas: nonZeroDeltas,
    } = parseEthSimulateV1CallResults(callResults, from);

    console.log(`[ethSimV1] Parsed: native=${nativeDelta}, ${nonZeroTokens.length} token changes`);

    // Enrich token metadata
    const client = await getSimulationClient(chainId);
    if (!client) return null;

    const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
      client,
      chainId,
      nonZeroTokens,
      nonZeroDeltas,
      fromAddress,
    );

    // Build native change
    const native = getNativeCurrency(chainId);
    let nativePriceUsd: number | null = null;
    if (nativeDelta !== 0n) {
      try {
        const { fetchNativePrice } = await import("../gasEstimation");
        nativePriceUsd = await fetchNativePrice(chainId);
      } catch {
        // Fall back to the portfolio price cache below.
      }
      if (nativePriceUsd === null) {
        const portfolioPrices = await getPortfolioPriceMap(fromAddress);
        const key = `${chainId}:native`;
        nativePriceUsd = portfolioPrices.get(key) ?? null;
      }
    }
    const nativeChange = buildNativeChange(
      nativeDelta,
      native,
      nativePriceUsd,
    );

    return {
      txSuccess: allSuccess,
      nativeChange,
      tokenChanges,
      simulationFailed: false,
      metadataComplete,
    };
  } catch (err: any) {
    console.log("[ethSimV1] Error:", err.message);
    // Network errors etc. — don't cache as unsupported, might be transient
    return null;
  }
}
