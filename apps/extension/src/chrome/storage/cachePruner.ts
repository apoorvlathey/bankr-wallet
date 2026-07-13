import {
  PORTFOLIO_HOLDINGS_CACHE_KEY,
  prunePortfolioHoldingsCacheValue,
} from "../portfolio/holdingsCache";
import { buildNonCriticalCachePrunePlan } from "./cachePolicy";

export interface CachePruneSummary {
  removedKeys: number;
  compactedKeys: number;
}

/** Best-effort cache pruning effect; callers decide whether failures matter. */
export async function pruneNonCriticalStorageCaches(): Promise<CachePruneSummary> {
  const now = Date.now();
  const allItems = await chrome.storage.local.get(null);
  const plan = buildNonCriticalCachePrunePlan(allItems, now);

  const portfolioPruned = prunePortfolioHoldingsCacheValue(
    allItems[PORTFOLIO_HOLDINGS_CACHE_KEY],
    now,
  );
  if (portfolioPruned.changed) {
    plan.compactedKeys += 1;
    if (portfolioPruned.next) {
      plan.updates[PORTFOLIO_HOLDINGS_CACHE_KEY] = portfolioPruned.next;
    } else {
      plan.keysToRemove.push(PORTFOLIO_HOLDINGS_CACHE_KEY);
    }
  }

  if (plan.keysToRemove.length > 0) {
    await chrome.storage.local.remove(plan.keysToRemove);
  }
  if (Object.keys(plan.updates).length > 0) {
    await chrome.storage.local.set(plan.updates);
  }

  return {
    removedKeys: plan.keysToRemove.length,
    compactedKeys: plan.compactedKeys,
  };
}
