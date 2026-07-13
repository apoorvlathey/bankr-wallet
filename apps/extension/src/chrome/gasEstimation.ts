/** Stable compatibility facade for single-transaction gas estimation. */
export {
  estimateGasLimitWithBuffer,
  fetchNativePrice,
} from "./gas/client";
export { estimateGas } from "./gas/singleEstimator";
export { bumpGasForEip7702Auth } from "./gas/singlePolicy";
export type {
  GasEstimate,
  GasEstimateTier,
  GasEstimateTiers,
} from "./gas/types";
