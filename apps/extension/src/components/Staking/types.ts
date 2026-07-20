import type { Account } from "@/chrome/types";
import type { GasEstimate } from "@/chrome/gasEstimation";
import type { SwapTxEntry } from "@/chrome/txHandlers";

export type StakingMode = "stake" | "unstake";
export type StakingAccountType = Account["type"];

export interface StakingApy {
  totalApy: number;
  wchanApy: number;
  wethApy: number;
}

export interface StakingState {
  wchanBalance: bigint;
  stakedBalance: bigint;
  allowance: bigint;
  penaltyBps: bigint;
  lastDepositTimestamp: bigint;
  earnedWeth: bigint;
  previewAmount: bigint | null;
}

export interface PreparedStakingPlan {
  action: "stake" | "unstake" | "claim";
  amount: bigint;
  transactions: SwapTxEntry[];
  batchTx: { to: string; data: string; value: string } | null;
  delegation: {
    delegate: `0x${string}`;
    needsAuth: boolean;
    onchainDelegate: `0x${string}` | null;
  } | null;
  gasEstimates: GasEstimate[] | null;
}

export interface StakingScreenProps {
  fromAddress: string;
  accountId?: string;
  accountType: StakingAccountType;
  onBack: () => void;
  onTransactionInitiated: () => void;
}
