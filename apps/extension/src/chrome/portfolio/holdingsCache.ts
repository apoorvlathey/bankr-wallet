import type { DefiPosition, PortfolioToken } from "./api";
import {
  PORTFOLIO_HOLDINGS_CACHE_VERSION,
  prunePortfolioHoldingsCacheValue,
  readPortfolioHoldingsCacheStore,
} from "./holdingsCachePolicy";

export { prunePortfolioHoldingsCacheValue } from "./holdingsCachePolicy";

export const PORTFOLIO_HOLDINGS_CACHE_KEY = "portfolioHoldingsCache";

const HOUR = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * HOUR;
export const PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY =
  "walletchan:portfolioHoldingsCache:v1";

export interface PortfolioHoldingsCacheSnapshot {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  omittedTokenCount: number;
  omittedTokenValueUsd: number;
  omittedTokenValueUsdByChain: Record<string, number>;
  customTokenKeys: string[];
  allTokenKeys: string[];
  hiddenTokenKeys: string[];
  onchainFetchedTokenKeys: string[];
  rpcIssueChainIds: number[];
  apiUnavailable: boolean;
  timestamp: number;
}

export interface PortfolioHoldingsCacheStore {
  version: typeof PORTFOLIO_HOLDINGS_CACHE_VERSION;
  entries: Record<string, PortfolioHoldingsCacheSnapshot>;
}

export interface PortfolioHoldingsCachePruneResult {
  changed: boolean;
  next?: PortfolioHoldingsCacheStore;
}

function isFreshSnapshot(
  snapshot: PortfolioHoldingsCacheSnapshot,
  now: number,
): boolean {
  return snapshot.timestamp <= now + HOUR && now - snapshot.timestamp <= MAX_AGE_MS;
}

function hasSnapshotContent(snapshot: PortfolioHoldingsCacheSnapshot): boolean {
  return snapshot.tokens.length > 0 || snapshot.defiPositions.length > 0;
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getPortfolioHoldingsSnapshotSync(
  _cacheKey: string,
): PortfolioHoldingsCacheSnapshot | null {
  void _cacheKey;
  // DOM localStorage is not wallet-reset-aware. The asynchronous
  // chrome.storage cache is canonical so a replacement wallet cannot inherit
  // the prior wallet's addresses, balances, or token imagery.
  return null;
}

export function clearPortfolioHoldingsLocalMirror(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
}

// Purge privacy-sensitive mirrors written by older extension versions. Never
// rehydrate from this key, even before chrome.storage.local finishes loading.
clearPortfolioHoldingsLocalMirror();

async function readCurrentStore(): Promise<PortfolioHoldingsCacheStore> {
  const result = await chrome.storage.local.get(PORTFOLIO_HOLDINGS_CACHE_KEY);
  return readPortfolioHoldingsCacheStore(
    result[PORTFOLIO_HOLDINGS_CACHE_KEY],
  );
}

export async function getPortfolioHoldingsSnapshot(
  cacheKey: string,
): Promise<PortfolioHoldingsCacheSnapshot | null> {
  const store = await readCurrentStore();
  const snapshot = store.entries[cacheKey];
  if (!snapshot) return null;

  if (!hasSnapshotContent(snapshot) || !isFreshSnapshot(snapshot, Date.now())) {
    await prunePortfolioHoldingsCache();
    return null;
  }

  return snapshot;
}

/** Latest reset-aware cached portfolio for an address, regardless of the UI's
 * current visible-chain cache key suffix. Background consumers use this for
 * fast metadata/price hints without making a portfolio network request. */
export async function getLatestPortfolioHoldingsSnapshotForAddress(
  address: string,
): Promise<PortfolioHoldingsCacheSnapshot | null> {
  const prefix = `${address.toLowerCase()}|`;
  const store = await readCurrentStore();
  const latest = Object.entries(store.entries)
    .filter(
      ([key, snapshot]) =>
        key.startsWith(prefix) &&
        hasSnapshotContent(snapshot) &&
        isFreshSnapshot(snapshot, Date.now()),
    )
    .sort((a, b) => b[1].timestamp - a[1].timestamp)[0]?.[1];
  return latest ?? null;
}

export async function savePortfolioHoldingsSnapshot(
  cacheKey: string,
  snapshot: PortfolioHoldingsCacheSnapshot,
): Promise<void> {
  const store = await readCurrentStore();
  store.entries[cacheKey] = snapshot;
  const pruned = prunePortfolioHoldingsCacheValue(store);

  if (pruned.next) {
    await chrome.storage.local.set({
      [PORTFOLIO_HOLDINGS_CACHE_KEY]: pruned.next,
    });
  } else {
    await chrome.storage.local.remove(PORTFOLIO_HOLDINGS_CACHE_KEY);
  }
}

export async function clearPortfolioHoldingsCache(): Promise<void> {
  clearPortfolioHoldingsLocalMirror();
  await chrome.storage.local.remove(PORTFOLIO_HOLDINGS_CACHE_KEY);
}

export async function prunePortfolioHoldingsCache(): Promise<void> {
  const result = await chrome.storage.local.get(PORTFOLIO_HOLDINGS_CACHE_KEY);
  const pruned = prunePortfolioHoldingsCacheValue(
    result[PORTFOLIO_HOLDINGS_CACHE_KEY],
  );
  if (!pruned.changed) return;

  if (pruned.next) {
    await chrome.storage.local.set({
      [PORTFOLIO_HOLDINGS_CACHE_KEY]: pruned.next,
    });
  } else {
    await chrome.storage.local.remove(PORTFOLIO_HOLDINGS_CACHE_KEY);
  }
}
