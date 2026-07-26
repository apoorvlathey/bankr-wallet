import { simulateBatchAssetChanges } from "./batchSimulation";
import { simulateAssetChanges } from "./singleSimulation";
import type { SimulationResult } from "./types";

interface SafeExecutionTx {
  from: string;
  to?: string;
  data?: string;
  value?: string;
  chainId: number;
}

/**
 * Preserve Safe-owned asset deltas while taking the revert verdict from the
 * exact signed execTransaction envelope. Injecting the simulator at the Safe
 * address replaces the proxy runtime, so an underlying Safe self-call cannot
 * provide a trustworthy success verdict by itself.
 */
export function mergeSafeSimulationResults(
  assetResult: SimulationResult,
  executionResult: SimulationResult,
): SimulationResult {
  if (executionResult.simulationFailed) {
    return {
      ...assetResult,
      approvalChanges: (assetResult.approvalChanges ?? []).map((change) => ({
        ...change,
        previousAmount: null,
        remainingAmount: null,
        verification: "unverified" as const,
        changeType: "unknown" as const,
      })),
      residualApprovals: [],
      approvalDetectionIncomplete:
        (assetResult.approvalDetectionIncomplete ?? false) ||
        (assetResult.approvalChanges ?? []).length > 0,
      txSuccess: true,
      simulationFailed: true,
      simulationError:
        executionResult.simulationError ||
        "Safe execution simulation unavailable",
    };
  }

  if (!executionResult.txSuccess) {
    return {
      ...assetResult,
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete:
        assetResult.approvalDetectionIncomplete ?? false,
      txSuccess: false,
      simulationFailed: assetResult.simulationFailed,
      simulationError: assetResult.simulationError,
    };
  }

  return {
    ...assetResult,
    txSuccess: executionResult.txSuccess,
    simulationFailed: assetResult.simulationFailed,
    simulationError: assetResult.simulationError,
  };
}

export async function simulateSafeAssetChanges(
  calls: { to?: string; data?: string; value?: string }[],
  safeAddress: string,
  executionTx: SafeExecutionTx | undefined,
  chainId: number,
): Promise<SimulationResult> {
  if (executionTx && (
    executionTx.chainId !== chainId ||
    executionTx.to?.toLowerCase() !== safeAddress.toLowerCase()
  )) {
    return {
      txSuccess: true,
      nativeChange: null,
      tokenChanges: [],
      approvalChanges: [],
      residualApprovals: [],
      approvalDetectionIncomplete: true,
      simulationFailed: true,
      simulationError: "Safe execution simulation context does not match",
      metadataComplete: true,
    };
  }

  const assetPromise = simulateBatchAssetChanges(calls, safeAddress, chainId, {
    candidateDiscovery: "directCalls",
  });
  if (!executionTx) return assetPromise;

  const [assetResult, executionResult] = await Promise.all([
    assetPromise,
    simulateAssetChanges(
      executionTx,
      executionTx.from,
      { includeApprovals: false },
    ),
  ]);
  return mergeSafeSimulationResults(assetResult, executionResult);
}
