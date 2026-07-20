import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseEther,
  type AccessList,
  type Address,
} from "viem";

import {
  buildNativeChange,
  normalizeRawNftsReceived,
} from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import {
  BATCH_SIMULATION_GAS_LIMIT,
  MAX_SIMULATION_ASSET_CHANGES,
  SIMULATION_GAS_LIMIT,
} from "./constants";
import { getNativeCurrency } from "./nativeCurrency";
import { getPortfolioPriceMap } from "./portfolioPrices";
import {
  BATCH_SIMULATOR_ABI,
  SIMULATOR_BYTECODE,
} from "./simulatorContract";
import { enrichTokenChanges } from "./tokenEnrichment";
import type { SimulationResult } from "./types";

export async function simulateBatchAssetChanges(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult> {
  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: false,
    metadataComplete: true,
  };

  const validCalls = calls.filter((c) => c.to);
  if (validCalls.length === 0) return EMPTY;

  console.log(`[batchSim] Starting batch simulation: ${validCalls.length} calls, from=${fromAddress}, chainId=${chainId}`);
  for (let i = 0; i < validCalls.length; i++) {
    console.log(`[batchSim] Call ${i}: to=${validCalls[i].to}, value=${validCalls[i].value}, data=${validCalls[i].data?.slice(0, 10)}...`);
  }

  const client = await getSimulationClient(chainId);
  if (!client) {
    console.log("[batchSim] FAILED: No RPC URL for chainId", chainId);
    return { ...EMPTY, simulationFailed: true, simulationError: "No RPC URL" };
  }

  const from = fromAddress as Address;

  try {
    // Step 1: Get access list for the full batch to discover ALL touched contracts.
    // We call eth_createAccessList on the encoded ERC-7821 batch transaction
    // (to = user's smart account, data = execute(mode, calls)).
    // This traces the entire batch sequentially, so call 2 (swap) sees state
    // changes from call 1 (approve) — critical for approve+swap batches where
    // the swap would revert without the prior approval.
    console.log("[batchSim] Step 1: Getting access list for full batch...");

    // Encode the batch as an ERC-7821 execute call to the user's own address
    const batchCallsEncoded = validCalls.map((call) => ({
      to: (call.to || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
    }));
    const totalValue = batchCallsEncoded.reduce((sum, c) => sum + c.value, 0n);
    const executionData = encodeAbiParameters(
      [{ type: "tuple[]", components: [
        { type: "address", name: "to" },
        { type: "uint256", name: "value" },
        { type: "bytes", name: "data" },
      ]}],
      [batchCallsEncoded],
    );
    const ERC7821_BATCH_MODE = "0x0100000000007821000100000000000000000000000000000000000000000000" as `0x${string}`;
    const batchCalldata = encodeFunctionData({
      abi: [{ inputs: [{ name: "mode", type: "bytes32" }, { name: "executionData", type: "bytes" }], name: "execute", outputs: [], stateMutability: "payable", type: "function" }] as const,
      functionName: "execute",
      args: [ERC7821_BATCH_MODE, executionData],
    });

    // Try full-batch access list first; fall back to per-call if it fails
    // (e.g. if the account isn't an ERC-7821 smart account onchain yet)
    let accessListEntries: AccessList = [];
    try {
      const batchAL = await client.createAccessList({
        account: from,
        to: from, // ERC-7821 execute targets the user's own address
        value: totalValue,
        data: batchCalldata,
        gas: SIMULATION_GAS_LIMIT,
      });
      console.log(`[batchSim] Full-batch AccessList: ${batchAL.accessList.length} entries`);
      accessListEntries = batchAL.accessList;
    } catch (err: any) {
      console.log(`[batchSim] Full-batch AccessList failed (${err.shortMessage || err.message}), falling back to per-call...`);
      // Fallback: per-call access lists (may miss cross-call dependencies)
      const perCallALs = await Promise.all(
        validCalls.map((call, i) =>
          client.createAccessList({
            account: from,
            to: call.to as Address,
            value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
            data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
            gas: SIMULATION_GAS_LIMIT,
          }).then((res) => {
            console.log(`[batchSim] AccessList call ${i}: ${res.accessList.length} entries`);
            return res;
          }).catch((err2) => {
            console.log(`[batchSim] AccessList call ${i} FAILED:`, err2.shortMessage || err2.message);
            return { accessList: [] as AccessList };
          }),
        ),
      );
      accessListEntries = perCallALs.flatMap((al) => al.accessList);
    }

    const seen = new Set<string>();
    seen.add(from.toLowerCase()); // exclude user's own address
    const candidates: Address[] = [];

    for (const entry of accessListEntries) {
      const addr = entry.address.toLowerCase();
      if (!seen.has(addr)) {
        seen.add(addr);
        candidates.push(entry.address as Address);
      }
    }
    // Also include each call's `to` address
    for (const call of validCalls) {
      const to = call.to!.toLowerCase();
      if (!seen.has(to)) {
        seen.add(to);
        candidates.push(call.to as Address);
      }
    }
    candidates.splice(MAX_SIMULATION_ASSET_CHANGES);
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
        {
          address: from,
          code: SIMULATOR_BYTECODE,
          balance: parseEther("100000"),
        },
      ],
    });

    console.log(`[batchSim] eth_call returned data: ${result.data ? result.data.length + " chars" : "null"}`);

    if (!result.data) {
      console.log("[batchSim] FAILED: Empty response from eth_call");
      return { ...EMPTY, simulationFailed: true, simulationError: "Empty response" };
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
    return { txSuccess, nativeChange, tokenChanges, simulationFailed: false, metadataComplete };
  } catch (err: any) {
    console.log("[batchSim] EXCEPTION:", err.shortMessage || err.message, err);
    return {
      ...EMPTY,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Batch simulation failed",
    };
  }
}
