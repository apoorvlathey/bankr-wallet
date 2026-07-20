import type {
  AssetChange,
  SimulationResult,
} from "@/chrome/txSimulation";
import type {
  AssetChangesDisplayProps,
  BatchAssetChangeCall,
} from "./types";

export interface AssetChangeGroups {
  allChanges: AssetChange[];
  incoming: AssetChange[];
  outgoing: AssetChange[];
  summary: string;
}

export function makeSimulationFailureResult(error: string): SimulationResult {
  return {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: true,
    simulationError: error,
    metadataComplete: true,
  };
}

export function makeBatchCallsKey(
  batchCalls: BatchAssetChangeCall[] | undefined,
): string | null {
  return batchCalls
    ? batchCalls
        .map((call) =>
          `${call.to ?? ""}|${call.data ?? ""}|${call.value ?? ""}`,
        )
        .join(";")
    : null;
}

export function buildSimulationMessage({
  txRequest,
  batchCalls,
  isNonAtomic,
  safeExecutionRequest,
}: Pick<
  AssetChangesDisplayProps,
  | "txRequest"
  | "batchCalls"
  | "isNonAtomic"
  | "safeExecutionRequest"
>) {
  if (batchCalls && safeExecutionRequest) {
    return {
      type: "simulateSafeAssetChanges",
      calls: batchCalls,
      safeAddress: txRequest.tx.from,
      executionTx: safeExecutionRequest.tx,
      chainId: txRequest.tx.chainId,
    };
  }
  return batchCalls
    ? {
        type: isNonAtomic
          ? "simulateBatchAssetChangesNonAtomic"
          : "simulateBatchAssetChanges",
        calls: batchCalls,
        fromAddress: txRequest.tx.from,
        chainId: txRequest.tx.chainId,
      }
    : {
        type: "simulateAssetChanges",
        tx: txRequest.tx,
        accountAddress: txRequest.tx.from,
      };
}

export function shouldRetryMetadata(result: SimulationResult): boolean {
  if (result.simulationFailed || result.metadataComplete) return false;
  return !(
    result.tokenChanges.length === 0 &&
    (!result.nativeChange || result.nativeChange.valueUsd !== null)
  );
}

export function isMetadataIncomplete(
  tokenChanges: AssetChange[],
  nativeChange: AssetChange | null,
): boolean {
  return (
    tokenChanges.some(
      (change) =>
        change.symbol.includes("...") ||
        change.valueUsd === null ||
        (!change.nft && !change.logoUrl),
    ) || !!(nativeChange && nativeChange.valueUsd === null)
  );
}

export function groupAssetChanges(result: SimulationResult): AssetChangeGroups {
  const allChanges = result.nativeChange
    ? [result.nativeChange, ...result.tokenChanges]
    : [...result.tokenChanges];
  const outgoing = allChanges.filter((change) => change.direction === "out");
  const incoming = allChanges.filter((change) => change.direction === "in");

  const summaryParts: string[] = [];
  for (const change of outgoing.slice(0, 2)) {
    summaryParts.push(`-${change.formattedAmount} ${change.symbol}`);
  }
  for (const change of incoming.slice(0, 2)) {
    summaryParts.push(`+${change.formattedAmount} ${change.symbol}`);
  }
  const moreCount = allChanges.length - summaryParts.length;
  if (moreCount > 0) summaryParts.push(`+${moreCount} more`);

  return {
    allChanges,
    incoming,
    outgoing,
    summary: summaryParts.join(", "),
  };
}
