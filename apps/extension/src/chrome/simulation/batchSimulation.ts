import {
  decodeFunctionResult,
  encodeFunctionData,
  parseEther,
  type Address,
} from "viem";

import {
  buildNativeChange,
  normalizeRawNftsReceived,
} from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import {
  BATCH_SIMULATION_GAS_LIMIT,
} from "./constants";
import {
  discoverBatchAssetCandidates,
  type BatchCandidateDiscovery,
  type BatchSimulationCall,
} from "./batchCandidates";
import { getNativeCurrency } from "./nativeCurrency";
import { getPortfolioPriceMap } from "./portfolioPrices";
import {
  BATCH_SIMULATOR_ABI,
} from "./simulatorContract";
import { buildIsolatedSimulatorOverride } from "./simulatorOverride";
import { enrichTokenChanges } from "./tokenEnrichment";
import {
  attachApprovalProjection,
  createApprovalProjectionPromise,
} from "./approvalAttachment";
import type { SimulationResult } from "./types";

export async function simulateBatchAssetChanges(
  calls: BatchSimulationCall[],
  fromAddress: string,
  chainId: number,
  options: {
    candidateDiscovery?: BatchCandidateDiscovery;
    includeApprovals?: boolean;
  } = {},
): Promise<SimulationResult> {
  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    approvalChanges: [],
    approvalDetectionIncomplete: false,
    simulationFailed: false,
    metadataComplete: true,
  };

  const validCalls = calls.filter((c) => c.to);
  if (validCalls.length === 0) return EMPTY;
  const approvalPromise = createApprovalProjectionPromise(
    validCalls,
    fromAddress,
    chainId,
    options.includeApprovals !== false,
  );
  const attachApprovals = (result: SimulationResult) =>
    attachApprovalProjection(result, approvalPromise);

  console.log(`[batchSim] Starting batch simulation: ${validCalls.length} calls, from=${fromAddress}, chainId=${chainId}`);
  for (let i = 0; i < validCalls.length; i++) {
    console.log(`[batchSim] Call ${i}: to=${validCalls[i].to}, value=${validCalls[i].value}, data=${validCalls[i].data?.slice(0, 10)}...`);
  }

  const client = await getSimulationClient(chainId);
  if (!client) {
    console.log("[batchSim] FAILED: No RPC URL for chainId", chainId);
    return attachApprovals({
      ...EMPTY,
      simulationFailed: true,
      simulationError: "No RPC URL",
    });
  }

  const from = fromAddress as Address;

  try {
    // ERC-7821 accounts use their real sequential execution path. Safe proxies
    // require direct-call discovery because an unsupported execute() selector
    // can still return a non-empty access list without touching call assets.
    console.log("[batchSim] Step 1: Getting access list for full batch...");
    const candidates = await discoverBatchAssetCandidates({
      client,
      calls: validCalls,
      from,
      chainId,
      strategy: options.candidateDiscovery ?? "erc7821",
    });
    console.log(`[batchSim] Merged ${candidates.length} candidate addresses`);

    // Step 2: Encode simulateBatch(calls, candidates) and run single eth_call
    console.log("[batchSim] Step 2: Encoding simulateBatch and calling...");
    const batchCallsTuples = validCalls.map((call) => ({
      to: (call.to || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
    }));

    const callData = encodeFunctionData({
      abi: BATCH_SIMULATOR_ABI,
      functionName: "simulateBatch",
      args: [batchCallsTuples, candidates],
    });
    console.log(`[batchSim] Encoded calldata length: ${callData.length} chars`);

    const result = await client.call({
      account: from, // sets tx.origin = from (critical for Permit2 / protocol checks)
      to: from,
      data: callData,
      gas: BATCH_SIMULATION_GAS_LIMIT,
      stateOverride: [
        buildIsolatedSimulatorOverride(from, parseEther("100000")),
      ],
    });

    console.log(`[batchSim] eth_call returned data: ${result.data ? result.data.length + " chars" : "null"}`);

    if (!result.data) {
      console.log("[batchSim] FAILED: Empty response from eth_call");
      return attachApprovals({
        ...EMPTY,
        simulationFailed: true,
        simulationError: "Empty response",
      });
    }

    // Step 3: Decode return values (same shape as simulate())
    const [txSuccess, ethDelta, tokens, deltas, rawNftsReceived] = decodeFunctionResult({
      abi: BATCH_SIMULATOR_ABI,
      functionName: "simulateBatch",
      data: result.data,
    });
    const nftsReceived = normalizeRawNftsReceived(rawNftsReceived);

    console.log("[batchSim] Step 3: Decoded result:", {
      txSuccess,
      ethDelta: ethDelta.toString(),
      tokenCount: (tokens as Address[]).length,
      nftsReceivedCount: nftsReceived.length,
    });

    // Step 4: Enrich token metadata + prices (reuse existing function)
    console.log("[batchSim] Step 4: Enriching token metadata...");
    const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
      client,
      chainId,
      tokens as Address[],
      deltas as bigint[],
      fromAddress,
      nftsReceived,
    );
    console.log(`[batchSim] Enriched: ${tokenChanges.length} token changes, metadataComplete=${metadataComplete}`);

    // Build native change
    const native = getNativeCurrency(chainId);
    let nativePriceUsd: number | null = null;
    if (ethDelta !== 0n) {
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
    const nativeChange = buildNativeChange(ethDelta, native, nativePriceUsd);

    console.log("[batchSim] Final result:", {
      txSuccess,
      nativeChange: nativeChange ? `${nativeChange.direction} ${nativeChange.formattedAmount} ${nativeChange.symbol}` : null,
      tokenChanges: tokenChanges.map((tc) => `${tc.direction} ${tc.formattedAmount} ${tc.symbol} (${tc.address})`),
    });
    return attachApprovals({
      txSuccess,
      nativeChange,
      tokenChanges,
      approvalChanges: [],
      approvalDetectionIncomplete: false,
      simulationFailed: false,
      metadataComplete,
    });
  } catch (err: any) {
    console.log("[batchSim] EXCEPTION:", err.shortMessage || err.message, err);
    return attachApprovals({
      ...EMPTY,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Batch simulation failed",
    });
  }
}
