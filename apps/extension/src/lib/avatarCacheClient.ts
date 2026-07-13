/**
 * Renderer-side helpers for reading the sanitized image cache populated by
 * the background worker. The canonical cache lives in chrome.storage.local,
 * which is wallet-reset-aware. Do not mirror identity imagery in DOM
 * localStorage: it survives background wallet resets and could briefly expose
 * the prior wallet's avatars to a fresh profile.
 */

import { sanitizeTrustedRendererImageSrc } from "@/lib/remoteImagePolicy";

const STORAGE_KEY = "ensAvatarImageCache";
const LOCALSTORAGE_MIRROR_KEY = "walletchan:imageCacheMirror:v1";
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
const listeners = new Set<() => void>();
function isFresh(entry: AvatarCacheEntry): boolean {
  return (
    Number.isFinite(entry?.cachedAt) &&
    Date.now() - entry.cachedAt < CACHE_DURATION_MS
  );
}

function validatedCachedRaster(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  return sanitizeTrustedRendererImageSrc(value);
}

function replaceMemoryCache(cache: AvatarCache): void {
  memCache.clear();
  for (const [url, entry] of Object.entries(cache)) {
    const dataUrl = validatedCachedRaster(entry?.dataUrl);
    if (dataUrl && isFresh(entry)) memCache.set(url, dataUrl);
  }
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

async function loadCache(): Promise<AvatarCache> {
  if (!cachePromise) {
    cachePromise = chrome.storage.local.get(STORAGE_KEY).then((res) => {
      const cache = (res[STORAGE_KEY] as AvatarCache) || {};
      replaceMemoryCache(cache);
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
    notifyListeners();
  });
}

// Purge mirrors written by older versions. The mirror is intentionally never
// read: chrome.storage.local is the reset-aware source of truth.
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(LOCALSTORAGE_MIRROR_KEY);
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

export function preloadAvatarCache(): Promise<AvatarCache> {
  return loadCache();
}

export function getCachedAvatarDataUrlSync(url: string): string | null {
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
          const dataUrl = validatedCachedRaster(response?.dataUrl);
          if (dataUrl) {
            memCache.set(url, dataUrl);
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
