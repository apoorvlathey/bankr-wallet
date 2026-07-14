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
  /** L1/source-chain balance cannot cover the estimated gas cost. */
  insufficientGasBalance?: boolean;
  /** L2/destination-chain balance cannot cover the transaction's native value. */
  insufficientTransactionValueBalance?: boolean;
  /** L2 native balance used for the force-inclusion value preflight. */
  transactionValueBalance?: string;
  /** Human-readable destination chain for the native-value warning. */
  transactionValueChainName?: string;
  /** Human-readable source chain whose native token pays the gas. */
  gasBalanceChainName?: string;
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
