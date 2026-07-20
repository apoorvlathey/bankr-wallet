import {
  clearPortfolioHoldingsCache,
  getPortfolioHoldingsSnapshotSync,
  savePortfolioHoldingsSnapshot,
  type PortfolioHoldingsCacheSnapshot,
} from "@/chrome/portfolio/holdingsCache";
import type { HoldingsSnapshot } from "./types";

const holdingsCache = new Map<string, HoldingsSnapshot>();
const deferredPersistenceTimers = new Map<string, number>();
const MAX_RENDERER_HOLDINGS_CACHE_ENTRIES = 4;
const PORTFOLIO_BACKGROUND_TASK_DELAY_MS = 250;
const PROGRESSIVE_CACHE_WRITE_DELAY_MS = 750;

export const holdingsCacheKey = (address: string, reloadKey: string) =>
  `${address.toLowerCase()}|${reloadKey}`;

function rememberRendererSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  holdingsCache.delete(cacheKey);
  holdingsCache.set(cacheKey, snapshot);
  while (holdingsCache.size > MAX_RENDERER_HOLDINGS_CACHE_ENTRIES) {
    const oldestKey = holdingsCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    holdingsCache.delete(oldestKey);
    const timer = deferredPersistenceTimers.get(oldestKey);
    if (timer != null) window.clearTimeout(timer);
    deferredPersistenceTimers.delete(oldestKey);
  }
}

export function toStoredHoldingsSnapshot(
  snapshot: HoldingsSnapshot,
): PortfolioHoldingsCacheSnapshot {
  return {
    ...snapshot,
    customTokenKeys: Array.from(snapshot.customTokenKeys),
    allTokenKeys: Array.from(snapshot.allTokenKeys),
    hiddenTokenKeys: Array.from(snapshot.hiddenTokenKeys),
    onchainFetchedTokenKeys: Array.from(snapshot.onchainFetchedTokenKeys),
  };
}

export function fromStoredHoldingsSnapshot(
  snapshot: PortfolioHoldingsCacheSnapshot,
): HoldingsSnapshot {
  return {
    ...snapshot,
    customTokenKeys: new Set(snapshot.customTokenKeys),
    allTokenKeys: new Set(snapshot.allTokenKeys),
    hiddenTokenKeys: new Set(snapshot.hiddenTokenKeys),
    onchainFetchedTokenKeys: new Set(snapshot.onchainFetchedTokenKeys),
  };
}

export function writeHoldingsSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  rememberRendererSnapshot(cacheKey, snapshot);
  void savePortfolioHoldingsSnapshot(
    cacheKey,
    toStoredHoldingsSnapshot(snapshot),
  ).catch(() => undefined);
}

export async function clearHoldingsCaches(): Promise<void> {
  holdingsCache.clear();
  for (const timer of deferredPersistenceTimers.values()) {
    window.clearTimeout(timer);
  }
  deferredPersistenceTimers.clear();
  try {
    await clearPortfolioHoldingsCache();
  } catch {
    // Best-effort display cache; live portfolio loading must continue.
  }
}

/** Coalesce scroll-driven page updates into one persistent cache write. */
export function writeProgressiveHoldingsSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  rememberRendererSnapshot(cacheKey, snapshot);
  const pending = deferredPersistenceTimers.get(cacheKey);
  if (pending != null) window.clearTimeout(pending);
  deferredPersistenceTimers.set(
    cacheKey,
    window.setTimeout(() => {
      deferredPersistenceTimers.delete(cacheKey);
      const latest = holdingsCache.get(cacheKey);
      if (!latest) return;
      void savePortfolioHoldingsSnapshot(
        cacheKey,
        toStoredHoldingsSnapshot(latest),
      ).catch(() => undefined);
    }, PROGRESSIVE_CACHE_WRITE_DELAY_MS),
  );
}

export function hasHoldingsSnapshotContent(
  snapshot: HoldingsSnapshot,
): boolean {
  return snapshot.tokens.length > 0 || snapshot.defiPositions.length > 0;
}

export function readCachedHoldingsSnapshot(
  cacheKey: string,
): HoldingsSnapshot | null {
  const cached = holdingsCache.get(cacheKey);
  if (cached && hasHoldingsSnapshotContent(cached)) {
    rememberRendererSnapshot(cacheKey, cached);
    return cached;
  }
  if (cached) holdingsCache.delete(cacheKey);

  const mirrored = getPortfolioHoldingsSnapshotSync(cacheKey);
  if (!mirrored) return null;

  const snapshot = fromStoredHoldingsSnapshot(mirrored);
  if (!hasHoldingsSnapshotContent(snapshot)) return null;
  rememberRendererSnapshot(cacheKey, snapshot);
  return snapshot;
}

export function rememberHoldingsSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  rememberRendererSnapshot(cacheKey, snapshot);
}

export function schedulePortfolioBackgroundTask(
  task: () => Promise<void>,
): void {
  window.setTimeout(() => {
    void task();
  }, PORTFOLIO_BACKGROUND_TASK_DELAY_MS);
}
