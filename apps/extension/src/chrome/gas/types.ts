export type TierName = "slow" | "standard" | "fast";

export interface FeeTier {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface EstimatedFeeTiers {
  tiers: Record<TierName, FeeTier>;
  baseFee: bigint;
  predictedNextBaseFee: bigint;
}

export interface EstimatedFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFee: bigint;
  predictedNextBaseFee?: bigint;
  tiers?: Record<TierName, FeeTier>;
}

export interface GasEstimateTier {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export type GasEstimateTiers = Record<TierName, GasEstimateTier>;

export interface GasEstimate {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  baseFee: string;
  estimatedCostWei: string;
  nativePriceUsd: number | null;
  nativeCurrencySymbol: string;
  accountBalance: string;
  insufficientBalance: boolean;
  estimationFailed: boolean;
  estimationError?: string;
  estimationErrorFull?: string;
  dappProvidedGas: boolean;
  dappGasInvalid?: boolean;
  fallbackUsed?: boolean;
  tiers?: GasEstimateTiers;
  predictedNextBaseFee?: string;
}

export interface BatchGasCall {
  to: string;
  data: string;
  value: string;
}

export interface RawBatchGasResult {
  gasLimit: bigint;
  fallbackUsed: boolean;
}
