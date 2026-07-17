import type { CompletedTransaction, GasData } from "./types";

/**
 * Force inclusion is paid by the L1 deposit. Receipt reconciliation may still
 * inspect the derived L2 receipt for asset changes, but it cannot replace a
 * tagged L1 fee record with L2 execution gas.
 */
export function selectHistoryGasData(
  existingTx: CompletedTransaction,
  incomingGasData: GasData | undefined,
): GasData | undefined {
  if (
    existingTx.forceInclusionMeta &&
    existingTx.gasData?.feeSource === "forceInclusionL1" &&
    incomingGasData?.feeSource !== "forceInclusionL1"
  ) {
    return existingTx.gasData;
  }
  return incomingGasData;
}
