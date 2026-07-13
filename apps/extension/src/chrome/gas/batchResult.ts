import { getNativeCurrencySymbol } from "@/constants/chainRegistry";
import type {
  GasEstimate,
  GasEstimateTiers,
  RawBatchGasResult,
} from "./types";

export interface BatchEstimateContext {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFee: bigint;
  balance: bigint;
  nativePriceUsd: number | null;
  nativeCurrencySymbol: string;
  tiers: GasEstimateTiers | undefined;
  predictedNextBaseFee: string | undefined;
}

export function buildBatchEstimates(
  results: RawBatchGasResult[],
  context: BatchEstimateContext,
): GasEstimate[] {
  return results.map(({ gasLimit, fallbackUsed }) => {
    const estimatedCostWei = gasLimit * context.maxFeePerGas;
    return {
      gasLimit: gasLimit.toString(),
      maxFeePerGas: context.maxFeePerGas.toString(),
      maxPriorityFeePerGas: context.maxPriorityFeePerGas.toString(),
      baseFee: context.baseFee.toString(),
      estimatedCostWei: estimatedCostWei.toString(),
      nativePriceUsd: context.nativePriceUsd,
      nativeCurrencySymbol: context.nativeCurrencySymbol,
      accountBalance: context.balance.toString(),
      insufficientBalance: context.balance < estimatedCostWei,
      estimationFailed: false,
      dappProvidedGas: false,
      fallbackUsed,
      tiers: context.tiers,
      predictedNextBaseFee: context.predictedNextBaseFee,
    };
  });
}

export async function makeFailedBatchEstimate(
  chainId: number,
  error: string,
): Promise<GasEstimate> {
  return {
    gasLimit: "200000",
    maxFeePerGas: "0",
    maxPriorityFeePerGas: "0",
    baseFee: "0",
    estimatedCostWei: "0",
    nativePriceUsd: null,
    nativeCurrencySymbol: await getNativeCurrencySymbol(chainId),
    accountBalance: "0",
    insufficientBalance: false,
    estimationFailed: true,
    estimationError: error,
    dappProvidedGas: false,
  };
}
