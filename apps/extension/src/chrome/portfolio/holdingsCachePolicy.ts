import type {
  PortfolioHoldingsCachePruneResult,
  PortfolioHoldingsCacheSnapshot,
  PortfolioHoldingsCacheStore,
} from "./holdingsCache";
import {
  MAX_REMOTE_PORTFOLIO_TOKENS,
  boundPortfolioTokens,
  sanitizeDefiPositions,
} from "./responsePolicy";

export const PORTFOLIO_HOLDINGS_CACHE_VERSION = 3;
export const MAX_PORTFOLIO_HOLDINGS_CACHE_ENTRIES = 4;
export const MAX_PORTFOLIO_HOLDINGS_CACHE_BYTES = 4 * 1024 * 1024;

const HOUR = 60 * 60 * 1000;
const MAX_AGE_MS = 24 * HOUR;
const MAX_CACHED_KEY_COUNT = 1_500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, MAX_CACHED_KEY_COUNT)
    : [];
}

function sanitizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .filter(
          (entry): entry is number =>
            typeof entry === "number" && Number.isFinite(entry),
        )
        .slice(0, 100)
    : [];
}

function sanitizeChainValues(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [chainKey, amount] of Object.entries(value).slice(0, 100)) {
    const chainId = Number(chainKey);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) continue;
    result[String(chainId)] = finiteNonNegative(amount);
  }
  return result;
}

function mergeChainValues(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged = { ...left };
  for (const [chainKey, amount] of Object.entries(right)) {
    merged[chainKey] = (merged[chainKey] ?? 0) + amount;
  }
  return merged;
}

function sanitizeSnapshot(
  value: unknown,
): { snapshot: PortfolioHoldingsCacheSnapshot; changed: boolean } | null {
  if (!isRecord(value)) return null;
  const bounded = boundPortfolioTokens(
    value.tokens,
    MAX_REMOTE_PORTFOLIO_TOKENS,
  );
  const defiPositions = sanitizeDefiPositions(value.defiPositions);
  if (!bounded || !defiPositions) return null;

  const timestamp = finiteNonNegative(value.timestamp);
  if (timestamp <= 0) return null;
  const storedOmittedCount = finiteNonNegative(value.omittedTokenCount);
  const storedOmittedValue = finiteNonNegative(value.omittedTokenValueUsd);
  const storedChainValues = sanitizeChainValues(
    value.omittedTokenValueUsdByChain,
  );
  const snapshot: PortfolioHoldingsCacheSnapshot = {
    tokens: bounded.tokens,
    defiPositions,
    totalValueUsd: finiteNonNegative(value.totalValueUsd),
    omittedTokenCount: storedOmittedCount + bounded.omittedTokenCount,
    omittedTokenValueUsd:
      storedOmittedValue + bounded.omittedTokenValueUsd,
    omittedTokenValueUsdByChain: mergeChainValues(
      storedChainValues,
      bounded.omittedTokenValueUsdByChain,
    ),
    customTokenKeys: sanitizeStringArray(value.customTokenKeys),
    allTokenKeys: sanitizeStringArray(value.allTokenKeys),
    hiddenTokenKeys: sanitizeStringArray(value.hiddenTokenKeys),
    onchainFetchedTokenKeys: sanitizeStringArray(value.onchainFetchedTokenKeys),
    rpcIssueChainIds: sanitizeNumberArray(value.rpcIssueChainIds),
    apiUnavailable: value.apiUnavailable === true,
    timestamp,
  };
  const changed =
    !Array.isArray(value.tokens) ||
    value.tokens.length !== snapshot.tokens.length ||
    !Array.isArray(value.defiPositions) ||
    value.defiPositions.length !== snapshot.defiPositions.length ||
    value.omittedTokenCount !== snapshot.omittedTokenCount ||
    value.omittedTokenValueUsd !== snapshot.omittedTokenValueUsd;
  return { snapshot, changed };
}

function readStoreDetailed(value: unknown): {
  store: PortfolioHoldingsCacheStore;
  changed: boolean;
} {
  if (
    !isRecord(value) ||
    value.version !== PORTFOLIO_HOLDINGS_CACHE_VERSION
  ) {
    return {
      store: { version: PORTFOLIO_HOLDINGS_CACHE_VERSION, entries: {} },
      changed: value !== undefined,
    };
  }
  const rawEntries = isRecord(value.entries) ? value.entries : {};
  const entries: Record<string, PortfolioHoldingsCacheSnapshot> = {};
  let changed = !isRecord(value.entries);
  for (const [cacheKey, entry] of Object.entries(rawEntries)) {
    const sanitized = sanitizeSnapshot(entry);
    if (!sanitized) {
      changed = true;
      continue;
    }
    entries[cacheKey] = sanitized.snapshot;
    changed ||= sanitized.changed;
  }
  return {
    store: { version: PORTFOLIO_HOLDINGS_CACHE_VERSION, entries },
    changed,
  };
}

export function readPortfolioHoldingsCacheStore(
  value: unknown,
): PortfolioHoldingsCacheStore {
  return readStoreDetailed(value).store;
}

function isFresh(
  snapshot: PortfolioHoldingsCacheSnapshot,
  now: number,
): boolean {
  return snapshot.timestamp <= now + HOUR && now - snapshot.timestamp <= MAX_AGE_MS;
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function prunePortfolioHoldingsCacheValue(
  value: unknown,
  now = Date.now(),
  maxEntries = MAX_PORTFOLIO_HOLDINGS_CACHE_ENTRIES,
  maxBytes = MAX_PORTFOLIO_HOLDINGS_CACHE_BYTES,
): PortfolioHoldingsCachePruneResult {
  if (value === undefined) return { changed: false };
  const parsed = readStoreDetailed(value);
  const candidates = Object.entries(parsed.store.entries)
    .filter(([, snapshot]) => isFresh(snapshot, now))
    .sort((a, b) => b[1].timestamp - a[1].timestamp);
  const freshEntries: Array<[string, PortfolioHoldingsCacheSnapshot]> = [];
  let usedBytes = 0;
  for (const entry of candidates) {
    if (freshEntries.length >= maxEntries) break;
    const entryBytes = serializedBytes(entry);
    if (entryBytes > maxBytes || usedBytes + entryBytes > maxBytes) continue;
    freshEntries.push(entry);
    usedBytes += entryBytes;
  }
  const originalKeys = Object.keys(parsed.store.entries);
  const changed =
    parsed.changed ||
    originalKeys.length !== freshEntries.length ||
    freshEntries.some(([cacheKey], index) => cacheKey !== originalKeys[index]);
  return {
    changed,
    next:
      freshEntries.length > 0
        ? {
            version: PORTFOLIO_HOLDINGS_CACHE_VERSION,
            entries: Object.fromEntries(freshEntries),
          }
        : undefined,
  };
}
