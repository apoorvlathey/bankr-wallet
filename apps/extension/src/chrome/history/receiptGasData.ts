import { OP_STACK_CHAIN_IDS } from "../../constants/networks";
import type { GasData } from "./types";

/** Projects one canonical receipt into the durable transaction-history shape. */
export function buildHistoryGasData(
  receipt: any,
  chainId: number,
  gasLimit?: bigint | string,
): GasData {
  const gasData: GasData = {
    gasUsed: BigInt(receipt.gasUsed).toString(),
    gasLimit:
      gasLimit === undefined
        ? BigInt(receipt.gasUsed).toString()
        : BigInt(gasLimit).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
  };
  if (OP_STACK_CHAIN_IDS.has(chainId)) {
    if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
    if (receipt.l1GasUsed) {
      gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
    }
    if (receipt.l1GasPrice) {
      gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }
  }
  return gasData;
}
