import type { PublicClient } from "viem";
import {
  applyPriorityFloor,
  enforceTierGap,
  getPriorityFeeFloor,
  percentile,
  predictNextBaseFee,
  tierFromTip,
} from "./feePolicy";
import {
  collectPriorityFeeSamples,
  legacyGasPriceTiers,
  tryMaxPriorityFeePerGas,
} from "./feeRpc";
import type { EstimatedFees, EstimatedFeeTiers } from "./types";

const SLOW_PERCENTILE = 25;
const STANDARD_PERCENTILE = 60;
const FAST_PERCENTILE = 90;

export async function estimateFeeTiers(
  client: PublicClient,
  chainId: number,
): Promise<EstimatedFeeTiers | null> {
  const floor = getPriorityFeeFloor(chainId);
  let baseFee: bigint | null = null;
  let nextBaseFee: bigint | null = null;
  try {
    const block = await client.getBlock({ blockTag: "latest" });
    if (typeof block.baseFeePerGas === "bigint") {
      baseFee = block.baseFeePerGas;
      nextBaseFee = predictNextBaseFee(block);
    }
  } catch {
    // Legacy gas-price fallback below remains authoritative for this failure.
  }
  if (baseFee === null || nextBaseFee === null) {
    return legacyGasPriceTiers(client, floor);
  }

  const samples = await collectPriorityFeeSamples(client);
  let priorityP25: bigint;
  let priorityP60: bigint;
  let priorityP90: bigint;
  if (samples?.length) {
    priorityP25 = percentile(samples, SLOW_PERCENTILE);
    priorityP60 = percentile(samples, STANDARD_PERCENTILE);
    priorityP90 = percentile(samples, FAST_PERCENTILE);
  } else {
    const fallback = (await tryMaxPriorityFeePerGas(client)) ?? 0n;
    priorityP25 = fallback;
    priorityP60 = fallback;
    priorityP90 = fallback;
  }
  const slowTip = applyPriorityFloor(priorityP25, floor);
  const standardTip = enforceTierGap(
    applyPriorityFloor(priorityP60, floor),
    slowTip,
  );
  const fastTip = enforceTierGap(
    applyPriorityFloor(priorityP90, floor),
    standardTip,
  );
  return {
    tiers: {
      slow: tierFromTip(slowTip, "slow", nextBaseFee),
      standard: tierFromTip(standardTip, "standard", nextBaseFee),
      fast: tierFromTip(fastTip, "fast", nextBaseFee),
    },
    baseFee,
    predictedNextBaseFee: nextBaseFee,
  };
}

export async function estimateFees(
  client: PublicClient,
  chainId: number,
): Promise<EstimatedFees | null> {
  const result = await estimateFeeTiers(client, chainId);
  if (!result) return null;
  const standard = result.tiers.standard;
  return {
    maxFeePerGas: standard.maxFeePerGas,
    maxPriorityFeePerGas: standard.maxPriorityFeePerGas,
    baseFee: result.baseFee,
    predictedNextBaseFee: result.predictedNextBaseFee,
    tiers: result.tiers,
  };
}
