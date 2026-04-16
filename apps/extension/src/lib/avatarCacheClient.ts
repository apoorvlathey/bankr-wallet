/**
 * Renderer-side helpers for reading the ENS avatar image cache populated by
 * the background worker. UI components call `useCachedAvatarSrc(url)` which
 * swaps in a cached data URL when available, else returns the raw URL and
 * kicks off a background fetch for next time.
 */

const STORAGE_KEY = "ensAvatarImageCache";
const CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

interface AvatarCacheEntry {
  dataUrl: string;
  sizeBytes: number;
  cachedAt: number;
  lastAccessedAt: number;
}

type AvatarCache = Record<string, AvatarCacheEntry>;

// One-shot read of the whole cache on first use. Subsequent resolutions hit
// the in-memory map, so repeated hook calls don't each trigger storage I/O.
let cachePromise: Promise<AvatarCache> | null = null;
const memCache = new Map<string, string>();
const fetchPromises = new Map<string, Promise<string | null>>();

function isFresh(entry: AvatarCacheEntry): boolean {
  return Date.now() - entry.cachedAt < CACHE_DURATION_MS;
}

async function loadCache(): Promise<AvatarCache> {
  if (!cachePromise) {
    cachePromise = chrome.storage.local.get(STORAGE_KEY).then((res) => {
      const cache = (res[STORAGE_KEY] as AvatarCache) || {};
      for (const [url, entry] of Object.entries(cache)) {
        if (isFresh(entry)) memCache.set(url, entry.dataUrl);
      }
      return cache;
    });
  }
  return cachePromise;
}

// Refresh when the background worker writes new entries so open UIs pick
// them up without a reload.
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const next = (changes[STORAGE_KEY].newValue as AvatarCache) || {};
    memCache.clear();
    for (const [url, entry] of Object.entries(next)) {
      if (isFresh(entry)) memCache.set(url, entry.dataUrl);
    }
  });
}

export async function getCachedAvatarDataUrl(
  url: string,
): Promise<string | null> {
  await loadCache();
  return memCache.get(url) ?? null;
}

export async function requestAvatarImageFetch(
  url: string,
): Promise<string | null> {
  const existing = fetchPromises.get(url);
  if (existing) return existing;

  const p = new Promise<string | null>((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "cacheAvatarImage", url },
        (response: { dataUrl: string | null } | undefined) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const dataUrl = response?.dataUrl ?? null;
          if (dataUrl) memCache.set(url, dataUrl);
          resolve(dataUrl);
        },
      );
    } catch {
      resolve(null);
    }
  }).finally(() => fetchPromises.delete(url));

  fetchPromises.set(url, p);
  return p;
}
