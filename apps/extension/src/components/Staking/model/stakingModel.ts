import { encodeFunctionData, formatUnits, parseUnits } from "viem";
import type { SwapTxEntry } from "@/chrome/txHandlers";
import { stakingErc20Abi, wchanVaultAbi } from "@/chrome/staking/abi";
import { PENALTY_DURATION_SECONDS, STAKING_ADDRESSES, STAKING_CHAIN_ID } from "../constants";
import type { StakingAccountType, StakingMode, StakingState } from "../types";

const TOKEN_ICON = "/walletchan-icon.png";

export function parseStakingAmount(value: string): bigint | null {
  if (!value || !/^\d*\.?\d*$/u.test(value) || Number(value) <= 0) return null;
  try {
    return parseUnits(value, 18);
  } catch {
    return null;
  }
}

export function amountFromPercentage(balance: bigint, percentage: number): string {
  if (percentage <= 0 || balance <= 0n) return "";
  return formatUnits((balance * BigInt(percentage)) / 100n, 18);
}

export function tokenAmountFromDisplay(
  value: string,
  isUsdMode: boolean,
  priceUsd: number,
): string {
  if (!isUsdMode) return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || priceUsd <= 0) return "";
  return (numericValue / priceUsd).toFixed(18).replace(/\.?0+$/u, "");
}

export function displayAmountFromToken(
  tokenAmount: string,
  isUsdMode: boolean,
  priceUsd: number,
): string {
  if (!isUsdMode) return tokenAmount;
  const numericAmount = Number(tokenAmount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || priceUsd <= 0) return "";
  return (numericAmount * priceUsd).toFixed(2);
}

export function percentageFromAmount(amount: bigint | null, balance: bigint): number {
  if (!amount || balance <= 0n) return 0;
  return Math.min(100, Number((amount * 100n) / balance));
}

export function buildStakingTransactions(input: {
  action: "stake" | "unstake" | "claim";
  amount: bigint;
  owner: string;
  allowance: bigint;
}): SwapTxEntry[] {
  const owner = input.owner as `0x${string}`;
  const vaultAddress = STAKING_ADDRESSES.wchanVault as `0x${string}`;
  const tokenAddress = STAKING_ADDRESSES.wchan as `0x${string}`;
  if (input.action === "claim") {
    return [entry("Claim WETH rewards", vaultAddress, encodeFunctionData({
      abi: wchanVaultAbi,
      functionName: "claimRewards",
    }), owner, "claimRewards")];
  }
  if (input.action === "unstake") {
    return [entry("Unstake WCHAN", vaultAddress, encodeFunctionData({
      abi: wchanVaultAbi,
      functionName: "redeem",
      args: [input.amount, owner, owner],
    }), owner, "redeem")];
  }

  const transactions: SwapTxEntry[] = [];
  if (input.allowance < input.amount) {
    transactions.push(entry("Approve WCHAN for staking", tokenAddress, encodeFunctionData({
      abi: stakingErc20Abi,
      functionName: "approve",
      args: [vaultAddress, input.amount],
    }), owner, "approve"));
  }
  transactions.push(entry("Stake WCHAN", vaultAddress, encodeFunctionData({
    abi: wchanVaultAbi,
    functionName: "deposit",
    args: [input.amount, owner],
  }), owner, "deposit"));
  return transactions;
}

export function shouldBatchStakingTransactions(input: {
  accountType: StakingAccountType;
  transactionCount: number;
  hasDelegate: boolean;
}): boolean {
  if (input.transactionCount <= 1) return false;
  if (input.accountType === "bankr") return true;
  return (
    (input.accountType === "privateKey" || input.accountType === "seedPhrase") &&
    input.hasDelegate
  );
}

function entry(origin: string, to: `0x${string}`, data: `0x${string}`, from: `0x${string}`, functionName: string): SwapTxEntry {
  return {
    tx: { from, to, data, value: "0x0", chainId: STAKING_CHAIN_ID },
    origin,
    favicon: TOKEN_ICON,
    functionName,
  };
}

export function activeBalance(state: StakingState | null, mode: StakingMode): bigint {
  if (!state) return 0n;
  return mode === "stake" ? state.wchanBalance : state.stakedBalance;
}

export function zeroPenaltyTimestamp(lastDepositTimestamp: bigint): number | null {
  if (lastDepositTimestamp <= 0n) return null;
  return (Number(lastDepositTimestamp) + PENALTY_DURATION_SECONDS) * 1000;
}
