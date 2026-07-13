import { withStorageLock } from "../storage/lock";
import {
  AVATAR_CACHE_DURATION_MS,
  AVATAR_CACHE_LOCK_KEY,
  AVATAR_CACHE_MAX_ENTRIES,
  AVATAR_CACHE_MAX_TOTAL_BYTES,
  AVATAR_CACHE_STORAGE_KEY,
} from "./constants";
import { isAllowedCachedAvatarDataUrl } from "./policy";
import type { AvatarCache, AvatarCacheEntry } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isAvatarCacheEntryValid(
  value: unknown,
  now = Date.now(),
): value is AvatarCacheEntry {
  if (!isRecord(value) || !isAllowedCachedAvatarDataUrl(value.dataUrl)) {
    return false;
  }
  return (
    typeof value.cachedAt === "number" &&
    Number.isFinite(value.cachedAt) &&
    typeof value.lastAccessedAt === "number" &&
    Number.isFinite(value.lastAccessedAt) &&
    typeof value.sizeBytes === "number" &&
    Number.isFinite(value.sizeBytes) &&
    value.sizeBytes === value.dataUrl.length &&
    now - value.cachedAt < AVATAR_CACHE_DURATION_MS
  );
}

export function pruneAvatarCache(cache: AvatarCache, now = Date.now()): void {
  for (const [key, entry] of Object.entries(cache)) {
    if (!isAvatarCacheEntryValid(entry, now)) delete cache[key];
  }

  const entries = Object.entries(cache).sort(
    (left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt,
  );
  let totalBytes = entries.reduce((sum, [, entry]) => sum + entry.sizeBytes, 0);
  while (
    (entries.length > AVATAR_CACHE_MAX_ENTRIES ||
      totalBytes > AVATAR_CACHE_MAX_TOTAL_BYTES) &&
    entries.length > 0
  ) {
    const [key, entry] = entries.shift()!;
    totalBytes -= entry.sizeBytes;
    delete cache[key];
  }
}

async function readAvatarCache(): Promise<AvatarCache | null> {
  try {
    const result = await chrome.storage.local.get(AVATAR_CACHE_STORAGE_KEY);
    const value = result[AVATAR_CACHE_STORAGE_KEY];
    return isRecord(value) ? (value as AvatarCache) : {};
  } catch {
    return null;
  }
}

export async function readCachedAvatarDataUrl(
  url: string,
): Promise<string | null> {
  const cache = await readAvatarCache();
  if (!cache) return null;
  const entry = cache[url];
  return isAvatarCacheEntryValid(entry) ? entry.dataUrl : null;
}

async function removeStaleCommit(
  url: string,
  committedEntry: AvatarCacheEntry,
): Promise<void> {
  try {
    const cache = await readAvatarCache();
    const current = cache?.[url];
    if (!cache || current?.dataUrl !== committedEntry.dataUrl) return;
    if (current.cachedAt !== committedEntry.cachedAt) return;
    delete cache[url];
    if (Object.keys(cache).length === 0) {
      await chrome.storage.local.remove(AVATAR_CACHE_STORAGE_KEY);
    } else {
      await chrome.storage.local.set({ [AVATAR_CACHE_STORAGE_KEY]: cache });
    }
  } catch {
    // Reset cleanup is best-effort; the reset manifest also removes this key.
  }
}

/** Locked, best-effort read-modify-write with an epoch-bound commit gate. */
export function commitAvatarDataUrl(
  url: string,
  dataUrl: string,
  isCommitCurrent: () => boolean,
): Promise<boolean> {
  return withStorageLock(AVATAR_CACHE_LOCK_KEY, async () => {
    if (!isCommitCurrent()) return false;
    const cache = await readAvatarCache();
    if (!isCommitCurrent()) return false;
    if (!cache) return true;

    const now = Date.now();
    const entry: AvatarCacheEntry = {
      dataUrl,
      sizeBytes: dataUrl.length,
      cachedAt: now,
      lastAccessedAt: now,
    };
    cache[url] = entry;
    pruneAvatarCache(cache, now);
    if (!isCommitCurrent()) return false;

    try {
      await chrome.storage.local.set({ [AVATAR_CACHE_STORAGE_KEY]: cache });
    } catch {
      return isCommitCurrent();
    }
    if (isCommitCurrent()) return true;
    await removeStaleCommit(url, entry);
    return false;
  });
}
