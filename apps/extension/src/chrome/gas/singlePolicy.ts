import {
  CHAIN_REGISTRY,
  NON_STANDARD_GAS_CHAIN_IDS,
} from "@/constants/chainRegistry";
import type { EstimatedFees, GasEstimateTiers } from "./types";

export const GAS_CHAIN_BY_ID = new Map(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);
export const DEFAULT_GAS_BUFFER_PCT = 20;

export function bumpGasForEip7702Auth(
  chainId: number,
  currentGas: bigint,
  authCount: number,
): bigint {
  if (authCount <= 0) return currentGas;
  const nonStandard = NON_STANDARD_GAS_CHAIN_IDS.has(chainId);
  const overhead = nonStandard ? 150_000n : 50_000n;
  const floor = nonStandard ? 300_000n : 80_000n;
  const bumped = currentGas + overhead * BigInt(authCount);
  return bumped > floor ? bumped : floor;
}

export function serializeFeeTiers(
  fees: EstimatedFees | null,
): GasEstimateTiers | undefined {
  if (!fees?.tiers) return undefined;
  return {
    slow: {
      maxFeePerGas: fees.tiers.slow.maxFeePerGas.toString(),
      maxPriorityFeePerGas:
        fees.tiers.slow.maxPriorityFeePerGas.toString(),
    },
    standard: {
      maxFeePerGas: fees.tiers.standard.maxFeePerGas.toString(),
      maxPriorityFeePerGas:
        fees.tiers.standard.maxPriorityFeePerGas.toString(),
    },
    fast: {
      maxFeePerGas: fees.tiers.fast.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.tiers.fast.maxPriorityFeePerGas.toString(),
    },
  };
}
