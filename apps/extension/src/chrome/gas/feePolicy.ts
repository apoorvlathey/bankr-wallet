import type { FeeTier, TierName } from "./types";

export const CUSTOM_TIER_BASE_FEE_MULT_NUM = 150n;
export const CUSTOM_TIER_BASE_FEE_MULT_DEN = 100n;

const PRIORITY_FEE_FLOOR_WEI: Record<number, bigint> = {
  1: 50_000_000n,
  42161: 1_000_000n,
  10: 1_000_000n,
  8453: 1_000_000n,
  137: 30_000_000_000n,
  130: 1_000_000n,
  56: 1_000_000_000n,
  4326: 1_000_000n,
};
const DEFAULT_PRIORITY_FEE_FLOOR_WEI = 100_000_000n;
const MIN_TIER_GAP_NUM = 112n;
const MIN_TIER_GAP_DEN = 100n;
const TIER_BASE_FEE_MULT_NUM: Record<TierName, bigint> = {
  slow: 125n,
  standard: 150n,
  fast: 200n,
};
const TIER_BASE_FEE_MULT_DEN = 100n;

export function getPriorityFeeFloor(chainId: number): bigint {
  return PRIORITY_FEE_FLOOR_WEI[chainId] ?? DEFAULT_PRIORITY_FEE_FLOOR_WEI;
}

export function tierFromTip(
  tip: bigint,
  tier: TierName,
  nextBaseFee: bigint,
): FeeTier {
  return {
    maxFeePerGas:
      (nextBaseFee * TIER_BASE_FEE_MULT_NUM[tier]) /
        TIER_BASE_FEE_MULT_DEN +
      tip,
    maxPriorityFeePerGas: tip,
  };
}

export function applyPriorityFloor(value: bigint, floor: bigint): bigint {
  return value < floor ? floor : value;
}

export function enforceTierGap(value: bigint, previous: bigint): bigint {
  const minimum = (previous * MIN_TIER_GAP_NUM) / MIN_TIER_GAP_DEN;
  return value < minimum ? minimum : value;
}

export function predictNextBaseFee(block: {
  baseFeePerGas?: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
}): bigint {
  const baseFee = block.baseFeePerGas;
  if (typeof baseFee !== "bigint") return 0n;
  const target = block.gasLimit / 2n;
  if (target === 0n) return baseFee;
  if (block.gasUsed > target) {
    const delta = ((block.gasUsed - target) * baseFee) / target / 8n;
    return baseFee + (delta === 0n ? 1n : delta);
  }
  return baseFee;
}

export function iqrFilter(sorted: bigint[]): bigint[] {
  if (sorted.length < 4) return sorted;
  const q1 = sorted[Math.floor(sorted.length / 4)];
  const q3 =
    sorted[Math.min(sorted.length - 1, Math.floor((3 * sorted.length) / 4))];
  const margin = ((q3 - q1) * 3n) / 2n;
  const low = q1 > margin ? q1 - margin : 0n;
  const high = q3 + margin;
  return sorted.filter((value) => value >= low && value <= high);
}

export function percentile(sorted: bigint[], value: number): bigint {
  if (sorted.length === 0) return 0n;
  const index = Math.min(
    sorted.length - 1,
    Math.floor((value / 100) * sorted.length),
  );
  return sorted[index];
}
