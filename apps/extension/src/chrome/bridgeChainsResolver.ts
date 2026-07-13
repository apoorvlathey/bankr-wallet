/** Stable bridge-chain resolution compatibility facade. */

export type { EnrichedBridgeChain } from "./bridge/types";
export {
  getBridgeDestinationChains,
  getBridgeSourceChains,
} from "./bridge/chainResolver";
export { getRegistryEntry } from "./bridge/chainPolicy";
