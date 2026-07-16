import { toHistoryBigInt } from "./assetTransferParser";

export interface NativeDeltaInput {
  currentBalance: bigint;
  previousBalance: bigint;
  receipt: any;
  payerForGas: boolean;
  siblingSenderCosts?: bigint;
}

/** Removes transaction fees and same-block sibling costs from a block delta. */
export function deriveNativeDelta({
  currentBalance,
  previousBalance,
  receipt,
  payerForGas,
  siblingSenderCosts = 0n,
}: NativeDeltaInput): string | undefined {
  let pureFlow = currentBalance - previousBalance;
  if (payerForGas) {
    try {
      const gasUsed = toHistoryBigInt(receipt.gasUsed);
      const effectiveGasPrice = toHistoryBigInt(receipt.effectiveGasPrice);
      const l1Fee = receipt.l1Fee ? toHistoryBigInt(receipt.l1Fee) : 0n;
      pureFlow += gasUsed * effectiveGasPrice + l1Fee;
    } catch {
      // Preserve the observable balance delta when gas fields are malformed.
    }
    pureFlow += siblingSenderCosts;
  }
  return pureFlow === 0n ? undefined : pureFlow.toString();
}
