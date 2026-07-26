import { simulateBatchAssetChanges } from "./batchSimulation";
import {
  simulateViaEthSimulateV1,
} from "./ethSimulateBatch";
import { runEthSimulateV1Calls } from "./ethSimulateClient";
import { simulateApprovalChanges } from "./approvalSimulation";
import type { AssetChange, SimulationResult } from "./types";

export function mergeNonAtomicSimulationResults(
  v1Result: SimulationResult | null,
  byteResult: SimulationResult | null,
): SimulationResult {
  if (!v1Result && !byteResult) {
    console.log("[batchSimNonAtomic] Both simulation paths failed");
    return {
      txSuccess: true,
      nativeChange: null,
      tokenChanges: [],
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete: true,
      simulationFailed: true,
      simulationError: "Batch simulation failed",
      metadataComplete: true,
    };
  }

  if (!v1Result) {
    console.log("[batchSimNonAtomic] Only bytecode-injection succeeded");
    return byteResult!;
  }
  if (!byteResult || byteResult.simulationFailed) {
    console.log("[batchSimNonAtomic] Only eth_simulateV1 succeeded");
    return v1Result;
  }

  // Prefer eth_simulateV1 for ERC-20/native deltas and the bytecode path for
  // token IDs, post-state NFT metadata, and the final revert verdict.
  const v1Erc20s = v1Result.tokenChanges.filter((change) => !change.nft);
  const v1Addrs = new Set(
    v1Erc20s.map((change) => change.address.toLowerCase()),
  );
  const byteNfts = byteResult.tokenChanges.filter((change) => !!change.nft);
  const byteOnlyErc20s = byteResult.tokenChanges.filter(
    (change) => !change.nft && !v1Addrs.has(change.address.toLowerCase()),
  );
  const merged: AssetChange[] = [
    ...v1Erc20s,
    ...byteOnlyErc20s,
    ...byteNfts,
  ];

  console.log("[batchSimNonAtomic] Merged result:", {
    v1Erc20s: v1Erc20s.length,
    byteOnlyErc20s: byteOnlyErc20s.length,
    byteNfts: byteNfts.length,
    nativeFrom: v1Result.nativeChange
      ? "v1"
      : byteResult.nativeChange
        ? "byte"
        : "none",
    txSuccessFrom: "bytecode",
    v1TxSuccess: v1Result.txSuccess,
    byteTxSuccess: byteResult.txSuccess,
  });

  return {
    txSuccess: byteResult.txSuccess,
    nativeChange: v1Result.nativeChange ?? byteResult.nativeChange,
    tokenChanges: merged,
    approvalChanges: v1Result.approvalChanges,
    residualApprovals: v1Result.residualApprovals,
    approvalDetectionIncomplete:
      v1Result.approvalDetectionIncomplete ||
      byteResult.approvalDetectionIncomplete,
    simulationFailed: false,
    metadataComplete:
      v1Result.metadataComplete && byteResult.metadataComplete,
  };
}

/**
 * Runs sequential EOA simulation through both RPC trace and bytecode paths.
 * The two operations deliberately start together and fail independently.
 */
export async function simulateBatchAssetChangesNonAtomic(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult> {
  const firstRunPromise = runEthSimulateV1Calls(
    calls,
    fromAddress,
    chainId,
  ).catch((err) => {
    console.log("[batchSimNonAtomic] eth_simulateV1 path threw:", err?.message);
    return null;
  });
  const bytePromise = simulateBatchAssetChanges(
    calls,
    fromAddress,
    chainId,
    { includeApprovals: false },
  ).catch((err) => {
      console.log(
        "[batchSimNonAtomic] bytecode-injection path threw:",
        err?.message,
      );
      return null;
    });
  const [firstRun, byteResult] = await Promise.all([
    firstRunPromise,
    bytePromise,
  ]);
  const [v1Result, approval] = await Promise.all([
    simulateViaEthSimulateV1(
      calls,
      fromAddress,
      chainId,
      firstRun,
    ),
    simulateApprovalChanges(
      calls,
      fromAddress,
      chainId,
      firstRun,
      { includeResidualApprovals: false },
    ),
  ]);
  const merged = mergeNonAtomicSimulationResults(v1Result, byteResult);
  return {
    ...merged,
    approvalChanges: approval.approvalChanges,
    residualApprovals: approval.residualApprovals,
    approvalDetectionIncomplete: approval.approvalDetectionIncomplete,
    metadataComplete:
      merged.metadataComplete && approval.metadataComplete,
  };
}
