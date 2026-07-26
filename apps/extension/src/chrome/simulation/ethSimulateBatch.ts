import { buildNativeChange } from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import {
  runEthSimulateV1Calls,
  type EthSimulateV1Run,
} from "./ethSimulateClient";
import { parseEthSimulateV1CallResults } from "./ethSimulateLogs";
import { getNativeCurrency } from "./nativeCurrency";
import { getPortfolioPriceMap } from "./portfolioPrices";
import { enrichTokenChanges } from "./tokenEnrichment";
import type { SimulationResult } from "./types";

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
  initialRun?: EthSimulateV1Run | null,
): Promise<SimulationResult | null> {
  const from = fromAddress.toLowerCase();

  try {
    const run =
      initialRun === undefined
        ? await runEthSimulateV1Calls(calls, fromAddress, chainId)
        : initialRun;
    if (!run) return null;
    const { callResults } = run;
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
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete: false,
      simulationFailed: false,
      metadataComplete,
    };
  } catch (err: any) {
    console.log("[ethSimV1] Error:", err.message);
    // Network errors etc. — don't cache as unsupported, might be transient
    return null;
  }
}
