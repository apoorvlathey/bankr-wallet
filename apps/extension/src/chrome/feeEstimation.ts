/** Stable compatibility facade for EIP-1559 fee estimation. */
export { estimateFees, estimateFeeTiers } from "./gas/feeEstimator";
export {
  CUSTOM_TIER_BASE_FEE_MULT_DEN,
  CUSTOM_TIER_BASE_FEE_MULT_NUM,
} from "./gas/feePolicy";
export type {
  EstimatedFees,
  EstimatedFeeTiers,
  FeeTier,
  TierName,
} from "./gas/types";
