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
      txSuccess: true,
      simulationFailed: true,
      simulationError:
        executionResult.simulationError ||
        "Safe execution simulation unavailable",
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
  executionTx: SafeExecutionTx,
  chainId: number,
): Promise<SimulationResult> {
  if (
    executionTx.chainId !== chainId ||
    executionTx.to?.toLowerCase() !== safeAddress.toLowerCase()
  ) {
    return {
      txSuccess: true,
      nativeChange: null,
      tokenChanges: [],
      simulationFailed: true,
      simulationError: "Safe execution simulation context does not match",
      metadataComplete: true,
    };
  }

  const [assetResult, executionResult] = await Promise.all([
    simulateBatchAssetChanges(calls, safeAddress, chainId),
    simulateAssetChanges(executionTx, executionTx.from),
  ]);
  return mergeSafeSimulationResults(assetResult, executionResult);
}
