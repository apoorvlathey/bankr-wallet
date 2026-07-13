/** Stable non-critical cache-pruning compatibility facade. */

export { CACHE_PRUNE_INTERVAL_MS } from "./storage/cachePolicy";
export {
  pruneNonCriticalStorageCaches,
  type CachePruneSummary,
} from "./storage/cachePruner";
