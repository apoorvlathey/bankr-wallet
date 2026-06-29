import type { DefiPosition, PortfolioToken } from "@/chrome/portfolioApi";

export const PORTFOLIO_HOLDINGS_CACHE_KEY = "portfolioHoldingsCache";

const CACHE_VERSION = 1;
const HOUR = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * HOUR;
const MAX_ENTRIES = 12;
const LOCAL_MIRROR_MAX_ENTRIES = 3;
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

function readLocalMirrorValue(): unknown {
  const storage = getLocalStorage();
  if (!storage) return undefined;

  const raw = storage.getItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    storage.removeItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
    return undefined;
  }
}

function writeLocalMirrorValue(value: unknown): void {
  const storage = getLocalStorage();
  if (!storage) return;

  const pruned = prunePortfolioHoldingsCacheValue(
    value,
    Date.now(),
    LOCAL_MIRROR_MAX_ENTRIES,
  );
  try {
    if (pruned.next) {
      storage.setItem(
        PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY,
        JSON.stringify(pruned.next),
      );
    } else {
      storage.removeItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
    }
  } catch {
    storage.removeItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
  }
}

function writeLocalMirrorSnapshot(
  cacheKey: string,
  snapshot: PortfolioHoldingsCacheSnapshot,
): void {
  const store = readStore(readLocalMirrorValue());
  if (hasSnapshotContent(snapshot)) {
    store.entries[cacheKey] = snapshot;
  } else {
    delete store.entries[cacheKey];
  }
  writeLocalMirrorValue(store);
}

export function getPortfolioHoldingsSnapshotSync(
  cacheKey: string,
): PortfolioHoldingsCacheSnapshot | null {
  const value = readLocalMirrorValue();
  if (value === undefined) return null;

  const pruned = prunePortfolioHoldingsCacheValue(
    value,
    Date.now(),
    LOCAL_MIRROR_MAX_ENTRIES,
  );
  if (pruned.changed) writeLocalMirrorValue(pruned.next);
  if (!pruned.next) return null;

  const snapshot = readStore(pruned.next).entries[cacheKey] ?? null;
  return snapshot && hasSnapshotContent(snapshot) ? snapshot : null;
}

export function clearPortfolioHoldingsLocalMirror(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(PORTFOLIO_HOLDINGS_LOCAL_MIRROR_KEY);
}

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

export async function savePortfolioHoldingsSnapshot(
  cacheKey: string,
  snapshot: PortfolioHoldingsCacheSnapshot,
): Promise<void> {
  writeLocalMirrorSnapshot(cacheKey, snapshot);
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
  writeLocalMirrorValue(readLocalMirrorValue());
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
