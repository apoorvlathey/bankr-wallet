import {
  clearPortfolioHoldingsCache,
  getPortfolioHoldingsSnapshotSync,
  savePortfolioHoldingsSnapshot,
  type PortfolioHoldingsCacheSnapshot,
} from "@/chrome/portfolio/holdingsCache";
import type { HoldingsSnapshot } from "./types";

const holdingsCache = new Map<string, HoldingsSnapshot>();
const PORTFOLIO_BACKGROUND_TASK_DELAY_MS = 250;

export const holdingsCacheKey = (address: string, reloadKey: string) =>
  `${address.toLowerCase()}|${reloadKey}`;

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
  holdingsCache.set(cacheKey, snapshot);
  void savePortfolioHoldingsSnapshot(
    cacheKey,
    toStoredHoldingsSnapshot(snapshot),
  ).catch(() => undefined);
}

export async function clearHoldingsCaches(): Promise<void> {
  holdingsCache.clear();
  try {
    await clearPortfolioHoldingsCache();
  } catch {
    // Best-effort display cache; live portfolio loading must continue.
  }
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
  if (cached && hasHoldingsSnapshotContent(cached)) return cached;
  if (cached) holdingsCache.delete(cacheKey);

  const mirrored = getPortfolioHoldingsSnapshotSync(cacheKey);
  if (!mirrored) return null;

  const snapshot = fromStoredHoldingsSnapshot(mirrored);
  if (!hasHoldingsSnapshotContent(snapshot)) return null;
  holdingsCache.set(cacheKey, snapshot);
  return snapshot;
}

export function rememberHoldingsSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  holdingsCache.set(cacheKey, snapshot);
}

export function schedulePortfolioBackgroundTask(
  task: () => Promise<void>,
): void {
  window.setTimeout(() => {
    void task();
  }, PORTFOLIO_BACKGROUND_TASK_DELAY_MS);
}
