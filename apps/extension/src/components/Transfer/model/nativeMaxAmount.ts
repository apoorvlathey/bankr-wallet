import { formatUnits, parseUnits } from "viem";
import type { GasEstimate } from "@/chrome/gasEstimation";

const NATIVE_MAX_RESERVE_BUFFER_PERCENT = 10n;

function parsePositiveBigInt(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Return a conservative spendable native balance after reserving gas.
 *
 * The estimator already buffers its gas limit. MAX additionally prices that
 * limit at the most expensive available tier and keeps 10% fee headroom so a
 * small base-fee move between the Send and Review screens does not make the
 * transaction revert for insufficient funds.
 */
export function calculateNativeMaxAmount(
  balance: string,
  decimals: number,
  estimate: GasEstimate,
): string | null {
  let balanceUnits: bigint;
  try {
    balanceUnits = parseUnits(balance, decimals);
  } catch {
    return null;
  }

  const gasLimit = parsePositiveBigInt(estimate.gasLimit);
  const estimatedCost = parsePositiveBigInt(estimate.estimatedCostWei);
  const feeCandidates = [
    estimate.maxFeePerGas,
    estimate.tiers?.slow.maxFeePerGas,
    estimate.tiers?.standard.maxFeePerGas,
    estimate.tiers?.fast.maxFeePerGas,
  ].map(parsePositiveBigInt);
  const highestFeePerGas = feeCandidates.reduce(
    (highest, candidate) => (candidate > highest ? candidate : highest),
    0n,
  );
  const tierCost = gasLimit * highestFeePerGas;
  const baseReserve = tierCost > estimatedCost ? tierCost : estimatedCost;
  if (baseReserve === 0n) return null;

  const reserve =
    (baseReserve * (100n + NATIVE_MAX_RESERVE_BUFFER_PERCENT) + 99n) / 100n;
  const spendable = balanceUnits > reserve ? balanceUnits - reserve : 0n;
  return formatUnits(spendable, decimals);
}
