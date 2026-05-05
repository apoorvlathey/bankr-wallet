/**
 * Robust EIP-1559 fee estimation with tier presets.
 *
 * Why we don't use viem's `client.estimateFeesPerGas()`:
 *
 *   - It calls `eth_maxPriorityFeePerGas`, which on most public RPCs (Geth/Erigon)
 *     returns the median tip from very recent blocks. On ETH mainnet during
 *     low-utilization windows that's frequently ~0 (sub-gwei), so the wallet
 *     would broadcast txs with priority fees well below the floor that
 *     mempool-watching nodes (Infura/Alchemy/Flashbots) accept.
 *
 *   - It uses a 1.2× base fee multiplier. Base fee can rise 12.5% per block,
 *     so 1.2× only covers ~1.5 blocks of upward movement. A tx broadcast with
 *     this maxFee is one moderately busy block away from being stuck in the
 *     mempool until it's evicted ("dropped").
 *
 * What this module does instead:
 *
 *   1. Pulls the last N blocks via `eth_feeHistory` and applies an IQR outlier
 *      filter (drop samples outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]) plus zero
 *      filtering. This removes both the long tail of empty blocks and the
 *      MEV-tipped outliers that would otherwise skew percentiles upward.
 *
 *   2. Computes three priority fee tiers from the cleaned sample:
 *      slow = p25, standard = p60, fast = p90. Then enforces a per-chain
 *      minimum floor and a minimum 12% gap between adjacent tiers so the
 *      picker never shows three identical numbers when the chain is quiet.
 *
 *   3. Predicts next-block baseFee using the EIP-1559 formula:
 *      `nextBase = current × (1 + (gasUsed − target) / target / 8)` when
 *      `gasUsed > target`, otherwise keeps current baseFee (we don't predict
 *      decreases — if base fee then rises while the tx is pending, the user
 *      is stuck with a too-low maxFee).
 *
 *   4. Computes maxFee per tier as `predictedNextBaseFee × multiplier + tip`,
 *      with multipliers slow=1.25× / standard=1.50× / fast=2.00×. Slow
 *      survives ~2 max-rise blocks; fast covers ~6.
 *
 *   5. Falls through to `eth_maxPriorityFeePerGas` if `eth_feeHistory` isn't
 *      supported, then to floor-only as a last resort.
 *
 * `estimateFees()` (single-tier API) returns the standard tier — keeps every
 * existing caller working unchanged. `estimateFeeTiers()` returns all three
 * for the UI tier picker.
 */

import { type PublicClient } from "viem";

// ---------------------------------------------------------------------------
// Per-chain priority fee floors
// ---------------------------------------------------------------------------

/**
 * Per-chain priority fee floors (in wei).
 *
 * Calibrated against live gas trackers (May 2026):
 *   - Etherscan Rapid ≈ 0.092 gwei → 0.05 gwei floor stays comfortably above
 *     the broken near-zero values that public RPCs return on quiet blocks
 *     while not overpaying ~10× during low-activity periods.
 *   - Polygon: validators reject txs with priority fee < 30 gwei (protocol-
 *     level spam mitigation introduced in 2022, still in force).
 *   - L2s (Arbitrum / Base / OP / Unichain / MegaETH): tip is mostly burned
 *     or routed to the sequencer at a fixed rate, so the floor only needs to
 *     prevent literal-zero rejections from strict RPCs.
 *   - BNB: validators expect ~1 gwei tips per the chain's gas market norm.
 */
const PRIORITY_FEE_FLOOR_WEI: Record<number, bigint> = {
  1: 50_000_000n, // Ethereum mainnet — 0.05 gwei
  42161: 1_000_000n, // Arbitrum — 0.001 gwei
  10: 1_000_000n, // Optimism — 0.001 gwei
  8453: 1_000_000n, // Base — 0.001 gwei
  137: 30_000_000_000n, // Polygon — 30 gwei (protocol-enforced spam floor)
  130: 1_000_000n, // Unichain — 0.001 gwei
  56: 1_000_000_000n, // BNB — 1 gwei
  4326: 1_000_000n, // MegaETH — 0.001 gwei
};

const DEFAULT_PRIORITY_FEE_FLOOR_WEI = 100_000_000n; // 0.1 gwei — safe default for unknown chains

// ---------------------------------------------------------------------------
// feeHistory sampling
// ---------------------------------------------------------------------------

/** Number of recent blocks to sample via eth_feeHistory. */
const FEE_HISTORY_BLOCK_COUNT = 10;

/**
 * Reward percentile we ask the RPC for inside each sampled block. Geth/Erigon
 * compute this per block from the actual transaction tips.
 */
const FEE_HISTORY_REWARD_PERCENTILE = 50;

// Per-tier across-block percentiles applied to the cleaned sample set.
const SLOW_PERCENTILE = 25;
const STANDARD_PERCENTILE = 60;
const FAST_PERCENTILE = 90;

/**
 * Minimum spacing between adjacent tiers so the picker never collapses to
 * three identical numbers when the network is quiet (which makes Slow/Fast
 * pointless). 12% mirrors the 12.5% per-block base fee max-change rate.
 */
const MIN_TIER_GAP_NUM = 112n;
const MIN_TIER_GAP_DEN = 100n;

// ---------------------------------------------------------------------------
// Per-tier baseFee multipliers
// ---------------------------------------------------------------------------
//
// Combined with the next-block baseFee predictor below, these set how many
// blocks of upward base-fee movement a tx can survive before becoming stuck:
//
//   slow     1.25×  ≈ 2 max-rise blocks (1.125² ≈ 1.27)
//   standard 1.50×  ≈ 4 max-rise blocks (1.125⁴ ≈ 1.60)
//   fast     2.00×  ≈ 6 max-rise blocks (1.125⁶ ≈ 2.03)

const TIER_BASE_FEE_MULT_NUM: Record<TierName, bigint> = {
  slow: 125n,
  standard: 150n,
  fast: 200n,
};
const TIER_BASE_FEE_MULT_DEN = 100n;

/** Multiplier used by the Custom-tier UI when it auto-derives Max Fee. */
export const CUSTOM_TIER_BASE_FEE_MULT_NUM = 150n;
export const CUSTOM_TIER_BASE_FEE_MULT_DEN = 100n;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TierName = "slow" | "standard" | "fast";

export interface FeeTier {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface EstimatedFeeTiers {
  tiers: Record<TierName, FeeTier>;
  /** baseFee from the latest block. */
  baseFee: bigint;
  /** EIP-1559 next-block baseFee prediction (≥ baseFee, never decreases). */
  predictedNextBaseFee: bigint;
}

export interface EstimatedFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFee: bigint;
  /** Optional — populated when a fresh tier estimate is available. */
  predictedNextBaseFee?: bigint;
  /** Optional — all three preset tiers from the same RPC pass. */
  tiers?: Record<TierName, FeeTier>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute Slow/Standard/Fast tiers in a single pass. Returns null if the
 * chain is pre-EIP-1559 or the RPC is unreachable.
 */
export async function estimateFeeTiers(
  client: PublicClient,
  chainId: number,
): Promise<EstimatedFeeTiers | null> {
  const floor =
    PRIORITY_FEE_FLOOR_WEI[chainId] ?? DEFAULT_PRIORITY_FEE_FLOOR_WEI;

  // Latest block gives us baseFee + utilization for the next-block predictor.
  let baseFee: bigint;
  let nextBaseFee: bigint;
  try {
    const block = await client.getBlock({ blockTag: "latest" });
    if (typeof block.baseFeePerGas !== "bigint") return null;
    baseFee = block.baseFeePerGas;
    nextBaseFee = predictNextBaseFee(block);
  } catch {
    return null;
  }

  // Pull priority fee samples from feeHistory; fall through to maxPriorityFeePerGas
  // and finally floor-only.
  const samples = await collectPriorityFeeSamples(client);

  let priorityP25: bigint;
  let priorityP60: bigint;
  let priorityP90: bigint;

  if (samples && samples.length > 0) {
    priorityP25 = percentile(samples, SLOW_PERCENTILE);
    priorityP60 = percentile(samples, STANDARD_PERCENTILE);
    priorityP90 = percentile(samples, FAST_PERCENTILE);
  } else {
    // Last resort: try eth_maxPriorityFeePerGas. Whatever it returns becomes
    // our standard tier; slow/fast are derived by the gap-spacing rule below.
    const fallback = await tryMaxPriorityFeePerGas(client);
    const v = fallback ?? 0n;
    priorityP25 = v;
    priorityP60 = v;
    priorityP90 = v;
  }

  // Apply per-chain floor and enforce monotonic spacing so the three preset
  // buttons always show three meaningfully different numbers.
  const slowTip = applyFloor(priorityP25, floor);
  const stdTip = enforceGap(applyFloor(priorityP60, floor), slowTip);
  const fastTip = enforceGap(applyFloor(priorityP90, floor), stdTip);

  return {
    tiers: {
      slow: tierFromTip(slowTip, "slow", nextBaseFee),
      standard: tierFromTip(stdTip, "standard", nextBaseFee),
      fast: tierFromTip(fastTip, "fast", nextBaseFee),
    },
    baseFee,
    predictedNextBaseFee: nextBaseFee,
  };
}

/**
 * Backwards-compatible single-tier API. Returns the standard tier — the
 * default we'd ship if the user doesn't pick anything else.
 */
export async function estimateFees(
  client: PublicClient,
  chainId: number,
): Promise<EstimatedFees | null> {
  const result = await estimateFeeTiers(client, chainId);
  if (!result) return null;
  const std = result.tiers.standard;
  return {
    maxFeePerGas: std.maxFeePerGas,
    maxPriorityFeePerGas: std.maxPriorityFeePerGas,
    baseFee: result.baseFee,
    predictedNextBaseFee: result.predictedNextBaseFee,
    tiers: result.tiers,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tierFromTip(
  tip: bigint,
  tier: TierName,
  nextBaseFee: bigint,
): FeeTier {
  const num = TIER_BASE_FEE_MULT_NUM[tier];
  const maxFee = (nextBaseFee * num) / TIER_BASE_FEE_MULT_DEN + tip;
  return {
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: tip,
  };
}

function applyFloor(value: bigint, floor: bigint): bigint {
  return value < floor ? floor : value;
}

/** Bumps `value` to be at least `prev × 1.12` (12% gap rule). */
function enforceGap(value: bigint, prev: bigint): bigint {
  const min = (prev * MIN_TIER_GAP_NUM) / MIN_TIER_GAP_DEN;
  return value < min ? min : value;
}

/**
 * EIP-1559 next-block baseFee prediction.
 *
 * The protocol formula:
 *   if gasUsed > target: nextBase = base × (1 + (gasUsed − target) / target / 8)
 *   if gasUsed < target: nextBase = base × (1 − (target − gasUsed) / target / 8)
 *   if gasUsed == target: nextBase = base
 *
 * We deliberately do NOT model the decrease. If the user broadcasts on a
 * predicted-decrease and the next block actually fills, they're stuck. Better
 * UX is to assume baseFee is sticky downward; the user pays a fraction of a
 * cent more on rare overestimates.
 */
function predictNextBaseFee(block: {
  baseFeePerGas?: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
}): bigint {
  const baseFee = block.baseFeePerGas;
  if (typeof baseFee !== "bigint") return 0n;

  // Target = gasLimit / elasticity multiplier (2 on ETH/L2s, 2 on Polygon).
  // Spec defines elasticity as 2 for all post-London chains we support.
  const target = block.gasLimit / 2n;
  if (target === 0n) return baseFee;

  if (block.gasUsed > target) {
    const delta = ((block.gasUsed - target) * baseFee) / target / 8n;
    return baseFee + (delta === 0n ? 1n : delta);
  }
  return baseFee;
}

/**
 * Pull priority fee samples via eth_feeHistory and clean them with an IQR
 * outlier filter. Returns sorted ascending samples ready for percentile.
 *
 * The IQR filter drops blocks whose 50p tip is more than 1.5× the
 * interquartile range outside Q1/Q3. This kills both empty/zero blocks
 * (already filtered separately) and the MEV outliers that single-tx tips
 * would otherwise pull the percentile toward.
 */
async function collectPriorityFeeSamples(
  client: PublicClient,
): Promise<bigint[] | null> {
  let history: any;
  try {
    history = await client.request({
      method: "eth_feeHistory",
      params: [
        `0x${FEE_HISTORY_BLOCK_COUNT.toString(16)}`,
        "latest",
        [FEE_HISTORY_REWARD_PERCENTILE],
      ] as any,
    } as any);
  } catch {
    return null;
  }

  const rewardArr = history?.reward as string[][] | undefined;
  if (!Array.isArray(rewardArr) || rewardArr.length === 0) return null;

  const raw: bigint[] = [];
  for (const entry of rewardArr) {
    if (!entry || entry.length === 0) continue;
    const v = BigInt(entry[0] ?? "0x0");
    if (v > 0n) raw.push(v);
  }
  if (raw.length === 0) return null;

  raw.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return iqrFilter(raw);
}

/**
 * Drop samples outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]. Input must be sorted
 * ascending. Returns a new sorted array.
 */
function iqrFilter(sorted: bigint[]): bigint[] {
  if (sorted.length < 4) return sorted;
  const q1 = sorted[Math.floor(sorted.length / 4)];
  const q3 = sorted[Math.min(sorted.length - 1, Math.floor((3 * sorted.length) / 4))];
  const iqr = q3 - q1;
  // 1.5·IQR ≈ (3·IQR)/2; use bigint math to avoid Number precision loss on
  // gwei-scale tips.
  const margin = (iqr * 3n) / 2n;
  const lo = q1 > margin ? q1 - margin : 0n;
  const hi = q3 + margin;
  return sorted.filter((x) => x >= lo && x <= hi);
}

/** Percentile lookup on an ascending-sorted bigint array. */
function percentile(sorted: bigint[], p: number): bigint {
  if (sorted.length === 0) return 0n;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

async function tryMaxPriorityFeePerGas(
  client: PublicClient,
): Promise<bigint | null> {
  try {
    const hex = await client.request({
      method: "eth_maxPriorityFeePerGas" as any,
    } as any);
    if (typeof hex !== "string") return null;
    return BigInt(hex);
  } catch {
    return null;
  }
}
