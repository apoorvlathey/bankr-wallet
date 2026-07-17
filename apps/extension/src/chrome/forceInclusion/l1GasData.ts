import { buildHistoryGasData } from "../history/receiptGasData";
import type { GasData } from "../txHistoryStorage";

/** Projects the fee-bearing L1 deposit receipt into the shared history shape. */
export function buildForceInclusionL1GasData(
  receipt: any,
  l1ChainId: number,
  gasLimit?: bigint | string,
): GasData {
  return {
    ...buildHistoryGasData(receipt, l1ChainId, gasLimit),
    feeSource: "forceInclusionL1",
  };
}

export function isForceInclusionL1GasData(
  gasData: GasData | undefined,
): boolean {
  return gasData?.feeSource === "forceInclusionL1";
}
