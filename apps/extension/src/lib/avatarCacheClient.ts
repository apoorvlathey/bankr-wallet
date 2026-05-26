/**
 * Renderer-side helpers for reading the sanitized image cache populated by
 * the background worker. The canonical cache lives in chrome.storage.local;
 * extension pages keep a smaller localStorage mirror so already-cached token
 * logos / avatars can paint synchronously on the first React render.
 */

const STORAGE_KEY = "ensAvatarImageCache";
const LOCALSTORAGE_MIRROR_KEY = "walletchan:imageCacheMirror:v1";
const CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_LOCALSTORAGE_MIRROR_BYTES = 2 * 1024 * 1024;

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
const listeners = new Set<() => void>();
let localStorageHydrated = false;

function isFresh(entry: AvatarCacheEntry): boolean {
  return Date.now() - entry.cachedAt < CACHE_DURATION_MS;
}

function safeParseCache(raw: string | null): AvatarCache {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ensureLocalStorageHydrated(): void {
  if (localStorageHydrated) return;
  localStorageHydrated = true;
  if (typeof window === "undefined") return;

  const mirror = safeParseCache(
    window.localStorage.getItem(LOCALSTORAGE_MIRROR_KEY),
  );
  for (const [url, entry] of Object.entries(mirror)) {
    if (isFresh(entry)) memCache.set(url, entry.dataUrl);
  }
}

function writeLocalStorageMirror(cache: AvatarCache): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(cache)
      .filter(([, entry]) => isFresh(entry))
      .sort((a, b) => b[1].lastAccessedAt - a[1].lastAccessedAt);
    const mirror: AvatarCache = {};
    let approxBytes = 2;

    for (const [url, entry] of entries) {
      const entryBytes = url.length + entry.dataUrl.length + 160;
      if (approxBytes + entryBytes > MAX_LOCALSTORAGE_MIRROR_BYTES) continue;
      mirror[url] = entry;
      approxBytes += entryBytes;
    }

    window.localStorage.setItem(
      LOCALSTORAGE_MIRROR_KEY,
      JSON.stringify(mirror),
    );
  } catch {
    // localStorage may be disabled or quota-limited. The chrome.storage cache
    // remains the source of truth, so a mirror write failure is harmless.
  }
}

function mergeLocalStorageEntry(url: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  try {
    const mirror = safeParseCache(
      window.localStorage.getItem(LOCALSTORAGE_MIRROR_KEY),
    );
    mirror[url] = {
      dataUrl,
      sizeBytes: dataUrl.length,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    writeLocalStorageMirror(mirror);
  } catch {
    // Best-effort mirror only.
  }
}

function replaceMemoryCache(cache: AvatarCache): void {
  memCache.clear();
  for (const [url, entry] of Object.entries(cache)) {
    if (isFresh(entry)) memCache.set(url, entry.dataUrl);
  }
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

async function loadCache(): Promise<AvatarCache> {
  ensureLocalStorageHydrated();
  if (!cachePromise) {
    cachePromise = chrome.storage.local.get(STORAGE_KEY).then((res) => {
      const cache = (res[STORAGE_KEY] as AvatarCache) || {};
      replaceMemoryCache(cache);
      writeLocalStorageMirror(cache);
      notifyListeners();
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
    replaceMemoryCache(next);
    writeLocalStorageMirror(next);
    notifyListeners();
  });
}

ensureLocalStorageHydrated();

export function preloadAvatarCache(): Promise<AvatarCache> {
  return loadCache();
}

export function getCachedAvatarDataUrlSync(url: string): string | null {
  ensureLocalStorageHydrated();
  return memCache.get(url) ?? null;
}

export function subscribeAvatarCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getCachedAvatarDataUrl(
  url: string,
): Promise<string | null> {
  const sync = getCachedAvatarDataUrlSync(url);
  if (sync) return sync;
  await loadCache();
  return memCache.get(url) ?? null;
}

export async function requestAvatarImageFetch(
  url: string,
): Promise<string | null> {
  const sync = getCachedAvatarDataUrlSync(url);
  if (sync) return sync;

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
          if (dataUrl) {
            memCache.set(url, dataUrl);
            mergeLocalStorageEntry(url, dataUrl);
            notifyListeners();
          }
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
