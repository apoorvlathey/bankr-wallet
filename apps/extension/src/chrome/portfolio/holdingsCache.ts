import type { DefiPosition, PortfolioToken } from "./api";

export const PORTFOLIO_HOLDINGS_CACHE_KEY = "portfolioHoldingsCache";

const CACHE_VERSION = 1;
const HOUR = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * HOUR;
const MAX_ENTRIES = 12;
export const PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY =
  "walletchan:portfolioHoldingsCache:v1";

export interface PortfolioHoldingsCacheSnapshot {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: string[];
  allTokenKeys: string[];
  hiddenTokenKeys: string[];
  onchainFetchedTokenKeys: string[];
  rpcIssueChainIds: number[];
  apiUnavailable: boolean;
  timestamp: number;
}

interface PortfolioHoldingsCacheStore {
  version: typeof CACHE_VERSION;
  entries: Record<string, PortfolioHoldingsCacheSnapshot>;
}

export interface PortfolioHoldingsCachePruneResult {
  changed: boolean;
  next?: PortfolioHoldingsCacheStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function sanitizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry),
      )
    : [];
}

function sanitizeSnapshot(
  value: unknown,
): PortfolioHoldingsCacheSnapshot | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.tokens) || !Array.isArray(value.defiPositions)) {
    return null;
  }

  const totalValueUsd =
    typeof value.totalValueUsd === "number" &&
    Number.isFinite(value.totalValueUsd)
      ? value.totalValueUsd
      : 0;
  const timestamp =
    typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp
      : 0;
  if (timestamp <= 0) return null;

  return {
    tokens: value.tokens as PortfolioToken[],
    defiPositions: value.defiPositions as DefiPosition[],
    totalValueUsd,
    customTokenKeys: sanitizeStringArray(value.customTokenKeys),
    allTokenKeys: sanitizeStringArray(value.allTokenKeys),
    hiddenTokenKeys: sanitizeStringArray(value.hiddenTokenKeys),
    onchainFetchedTokenKeys: sanitizeStringArray(value.onchainFetchedTokenKeys),
    rpcIssueChainIds: sanitizeNumberArray(value.rpcIssueChainIds),
    apiUnavailable: value.apiUnavailable === true,
    timestamp,
  };
}

function readStore(value: unknown): PortfolioHoldingsCacheStore {
  if (!isRecord(value) || value.version !== CACHE_VERSION) {
    return { version: CACHE_VERSION, entries: {} };
  }
  const rawEntries = isRecord(value.entries) ? value.entries : {};
  const entries: Record<string, PortfolioHoldingsCacheSnapshot> = {};

  for (const [cacheKey, entry] of Object.entries(rawEntries)) {
    const snapshot = sanitizeSnapshot(entry);
    if (snapshot) entries[cacheKey] = snapshot;
  }

  return { version: CACHE_VERSION, entries };
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

export function prunePortfolioHoldingsCacheValue(
  value: unknown,
  now = Date.now(),
  maxEntries = MAX_ENTRIES,
): PortfolioHoldingsCachePruneResult {
  if (value === undefined) return { changed: false };
  const store = readStore(value);
  const freshEntries = Object.entries(store.entries)
    .filter(([, snapshot]) => isFreshSnapshot(snapshot, now))
    .sort((a, b) => b[1].timestamp - a[1].timestamp)
    .slice(0, maxEntries);
  const next: PortfolioHoldingsCacheStore = {
    version: CACHE_VERSION,
    entries: Object.fromEntries(freshEntries),
  };

  const originalEntries = isRecord(value) && isRecord(value.entries)
    ? Object.keys(value.entries)
    : [];
  const changed =
    !isRecord(value) ||
    value.version !== CACHE_VERSION ||
    originalEntries.length !== freshEntries.length ||
    freshEntries.some(
      ([cacheKey], index) => cacheKey !== originalEntries[index],
    );

  return {
    changed,
    next: freshEntries.length > 0 ? next : undefined,
  };
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
  return readStore(result[PORTFOLIO_HOLDINGS_CACHE_KEY]);
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
