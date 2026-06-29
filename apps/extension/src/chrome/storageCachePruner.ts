/**
 * Best-effort pruning for non-critical chrome.storage.local caches.
 *
 * These keys speed up rendering and metadata lookups, but they must never be
 * allowed to crowd out wallet-critical writes like vault/account/pending tx
 * state. Keep TTLs in sync with the owning cache modules.
 */

import {
  PORTFOLIO_HOLDINGS_CACHE_KEY,
  prunePortfolioHoldingsCacheValue,
} from "@/chrome/portfolioHoldingsCache";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const CACHE_PRUNE_INTERVAL_MS = 6 * HOUR;

const CLEAR_SIGNING_SCHEMA_VERSION = 3;

const PREFIX_CACHE_RULES = [
  { prefix: "tokenInfo:", timestampKey: "fetchedAt", ttlMs: 30 * DAY },
  { prefix: "tokenLogo:", timestampKey: "fetchedAt", ttlMs: 30 * DAY },
  { prefix: "ethShLabels:", timestampKey: "fetchedAt", ttlMs: 7 * DAY },
  { prefix: "swapTokenList:", timestampKey: "fetchedAt", ttlMs: 1 * DAY },
] as const;

const OBJECT_CACHE_RULES = [
  { key: "coingeckoMarketCache", timestampKey: "fetchedAt", ttlMs: 5 * MINUTE },
  { key: "coingeckoSearchCache", timestampKey: "fetchedAt", ttlMs: 1 * DAY },
  {
    key: "coingeckoNativeResolutionCache",
    timestampKey: "fetchedAt",
    ttlMs: 7 * DAY,
  },
  {
    key: "coingeckoErc20PriceCache",
    timestampKey: "fetchedAt",
    ttlMs: 5 * MINUTE,
  },
] as const;

const AVATAR_CACHE_KEY = "ensAvatarImageCache";
const AVATAR_CACHE_TTL_MS = 14 * DAY;
const AVATAR_CACHE_MAX_ENTRIES = 200;
const AVATAR_CACHE_MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export interface CachePruneSummary {
  removedKeys: number;
  compactedKeys: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function timestampExpired(
  value: unknown,
  timestampKey: string,
  ttlMs: number,
  now: number,
): boolean {
  if (!isRecord(value)) return true;
  const timestamp = value[timestampKey];
  return (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    timestamp > now + HOUR ||
    now - timestamp > ttlMs
  );
}

function shouldPruneClearSigningEntry(value: unknown, now: number): boolean {
  if (!isRecord(value)) return true;
  const schemaVersion =
    typeof value.schemaVersion === "number" ? value.schemaVersion : 1;
  if (schemaVersion < CLEAR_SIGNING_SCHEMA_VERSION) return true;
  const ttlMs = value.descriptor ? 7 * DAY : 1 * DAY;
  return timestampExpired(value, "updatedAt", ttlMs, now);
}

function pruneObjectCache(
  value: unknown,
  timestampKey: string,
  ttlMs: number,
  now: number,
): { changed: boolean; next?: Record<string, unknown> } {
  if (value === undefined) return { changed: false };
  if (!isRecord(value)) return { changed: true };

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (timestampExpired(entry, timestampKey, ttlMs, now)) {
      changed = true;
    } else {
      next[key] = entry;
    }
  }

  return { changed, next };
}

function pruneAvatarCache(
  value: unknown,
  now: number,
): { changed: boolean; next?: Record<string, unknown> } {
  if (value === undefined) return { changed: false };
  if (!isRecord(value)) return { changed: true };

  let changed = false;
  const entries: Array<[string, Record<string, unknown>]> = [];

  for (const [key, entry] of Object.entries(value)) {
    if (
      !isRecord(entry) ||
      timestampExpired(entry, "cachedAt", AVATAR_CACHE_TTL_MS, now) ||
      typeof entry.sizeBytes !== "number" ||
      typeof entry.lastAccessedAt !== "number"
    ) {
      changed = true;
      continue;
    }
    entries.push([key, entry]);
  }

  let totalBytes = entries.reduce(
    (sum, [, entry]) => sum + (entry.sizeBytes as number),
    0,
  );

  if (
    entries.length > AVATAR_CACHE_MAX_ENTRIES ||
    totalBytes > AVATAR_CACHE_MAX_TOTAL_BYTES
  ) {
    changed = true;
    entries.sort(
      (a, b) =>
        (a[1].lastAccessedAt as number) - (b[1].lastAccessedAt as number),
    );
    while (
      (entries.length > AVATAR_CACHE_MAX_ENTRIES ||
        totalBytes > AVATAR_CACHE_MAX_TOTAL_BYTES) &&
      entries.length > 0
    ) {
      const [, oldest] = entries.shift()!;
      totalBytes -= oldest.sizeBytes as number;
    }
  }

  return { changed, next: Object.fromEntries(entries) };
}

export async function pruneNonCriticalStorageCaches(): Promise<CachePruneSummary> {
  const now = Date.now();
  const allItems = await chrome.storage.local.get(null);
  const keysToRemove: string[] = [];
  const updates: Record<string, unknown> = {};
  let compactedKeys = 0;

  for (const [key, value] of Object.entries(allItems)) {
    const prefixRule = PREFIX_CACHE_RULES.find((rule) =>
      key.startsWith(rule.prefix),
    );
    if (
      prefixRule &&
      timestampExpired(value, prefixRule.timestampKey, prefixRule.ttlMs, now)
    ) {
      keysToRemove.push(key);
      continue;
    }

    if (key.startsWith("cs:desc:") && shouldPruneClearSigningEntry(value, now)) {
      keysToRemove.push(key);
    }
  }

  for (const rule of OBJECT_CACHE_RULES) {
    const pruned = pruneObjectCache(
      allItems[rule.key],
      rule.timestampKey,
      rule.ttlMs,
      now,
    );
    if (!pruned.changed) continue;
    compactedKeys += 1;
    if (pruned.next && Object.keys(pruned.next).length > 0) {
      updates[rule.key] = pruned.next;
    } else {
      keysToRemove.push(rule.key);
    }
  }

  const avatarPruned = pruneAvatarCache(allItems[AVATAR_CACHE_KEY], now);
  if (avatarPruned.changed) {
    compactedKeys += 1;
    if (avatarPruned.next && Object.keys(avatarPruned.next).length > 0) {
      updates[AVATAR_CACHE_KEY] = avatarPruned.next;
    } else {
      keysToRemove.push(AVATAR_CACHE_KEY);
    }
  }

  const portfolioHoldingsPruned = prunePortfolioHoldingsCacheValue(
    allItems[PORTFOLIO_HOLDINGS_CACHE_KEY],
    now,
  );
  if (portfolioHoldingsPruned.changed) {
    compactedKeys += 1;
    if (portfolioHoldingsPruned.next) {
      updates[PORTFOLIO_HOLDINGS_CACHE_KEY] =
        portfolioHoldingsPruned.next;
    } else {
      keysToRemove.push(PORTFOLIO_HOLDINGS_CACHE_KEY);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  return { removedKeys: keysToRemove.length, compactedKeys };
}
