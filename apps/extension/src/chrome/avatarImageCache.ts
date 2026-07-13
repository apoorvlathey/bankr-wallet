/**
 * ENS avatar image cache (background-only).
 *
 * Fetches avatar URLs, validates them, decodes via createImageBitmap (which
 * produces a raw pixel buffer — any embedded script/metadata is discarded),
 * re-encodes to WebP via OffscreenCanvas, and stores the resulting data URL
 * in chrome.storage.local keyed by source URL.
 *
 * Security model: the cached value is guaranteed to be raster pixel data, so
 * it is safe to render in an <img src> without risk of SVG/polyglot payloads
 * reaching the DOM.
 */

import {
  isAllowedRasterImageContentType,
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

const STORAGE_KEY = "ensAvatarImageCache";
const CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB cap on stored data URLs
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024; // 2 MB raw download cap
const MAX_ENCODED_BYTES = 512 * 1024; // 512 KB re-encoded cap per image
const TARGET_DIM = 128; // resize box (avatars display ≤24 px, 128 covers 4x DPI)
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_CONCURRENT_IMAGE_FETCHES = 2;

/**
 * Consume an image response without ever buffering more than the configured
 * ceiling. `Response.blob()` only exposes the size after the entire body has
 * already been allocated, so a missing/false Content-Length would otherwise
 * let an untrusted avatar host exhaust the service worker before we reject it.
 */
export async function readAvatarBlobBounded(
  response: Response,
  maxBytes: number,
  contentType: string,
): Promise<Blob | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const declared = Number(declaredLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
  }

  if (!response.body) return new Blob([], { type: contentType });
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: contentType });
}

export interface AvatarCacheEntry {
  dataUrl: string;
  sizeBytes: number;
  cachedAt: number;
  lastAccessedAt: number;
}

type AvatarCache = Record<string, AvatarCacheEntry>;

// Deduplicate concurrent fetches for the same URL within a service worker session.
const inFlight = new Map<string, Promise<string | null>>();
const fetchQueue: Array<() => void> = [];
const activeImageFetchControllers = new Set<AbortController>();
let activeImageFetches = 0;
let walletImageCacheEpoch = 0;

/** Abort old-wallet image work before reset storage is cleared. */
export function invalidateAvatarImageCacheForWalletReset(): void {
  walletImageCacheEpoch += 1;
  for (const controller of activeImageFetchControllers) controller.abort();
  activeImageFetchControllers.clear();
  inFlight.clear();
}

async function acquireImageFetchSlot(): Promise<void> {
  if (activeImageFetches < MAX_CONCURRENT_IMAGE_FETCHES) {
    activeImageFetches += 1;
    return;
  }

  await new Promise<void>((resolve) => fetchQueue.push(resolve));
}

function releaseImageFetchSlot(): void {
  const next = fetchQueue.shift();
  if (next) {
    next();
    return;
  }
  activeImageFetches = Math.max(0, activeImageFetches - 1);
}

async function runQueuedImageFetch(
  url: string,
  expectedEpoch: number,
): Promise<string | null> {
  await acquireImageFetchSlot();
  try {
    if (expectedEpoch !== walletImageCacheEpoch) return null;
    return await doFetchAndEncode(url, expectedEpoch);
  } finally {
    releaseImageFetchSlot();
  }
}

async function readCache(): Promise<AvatarCache> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as AvatarCache) || {};
}

async function writeCache(cache: AvatarCache): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch {
    // Image caching is best-effort; callers can still use live URLs/results.
  }
}

function isCacheEntryValid(entry: AvatarCacheEntry): boolean {
  return (
    !!entry &&
    Number.isFinite(entry.cachedAt) &&
    Number.isFinite(entry.lastAccessedAt) &&
    Number.isFinite(entry.sizeBytes) &&
    typeof entry.dataUrl === "string" &&
    entry.dataUrl.startsWith("data:image/") &&
    sanitizeTrustedRendererImageSrc(entry.dataUrl) === entry.dataUrl &&
    entry.sizeBytes === entry.dataUrl.length &&
    Date.now() - entry.cachedAt < CACHE_DURATION_MS
  );
}

/**
 * Avatar/token-logo URLs can be controlled by ENS records and token metadata.
 * Keep the extension's broad host permissions from becoming a localhost or
 * private-network fetch proxy. Redirect targets are validated with the same
 * predicate before any follow-up request.
 */
export function isAllowedAvatarUrl(value: string): boolean {
  return isAllowedRemoteImageUrl(value);
}

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

function prune(cache: AvatarCache): void {
  const now = Date.now();
  // Drop expired
  for (const [k, v] of Object.entries(cache)) {
    if (!isCacheEntryValid(v) || now - v.cachedAt > CACHE_DURATION_MS) {
      delete cache[k];
    }
  }
  // LRU eviction while over limits
  let entries = Object.entries(cache);
  let totalBytes = entries.reduce((s, [, v]) => s + v.sizeBytes, 0);
  if (entries.length <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) return;

  entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
  while (
    (entries.length > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) &&
    entries.length > 0
  ) {
    const [oldestKey, oldestEntry] = entries.shift()!;
    totalBytes -= oldestEntry.sizeBytes;
    delete cache[oldestKey];
  }
}

async function doFetchAndEncode(
  url: string,
  expectedEpoch: number,
): Promise<string | null> {
  if (
    expectedEpoch !== walletImageCacheEpoch ||
    !isAllowedAvatarUrl(url)
  ) {
    return null;
  }

  const controller = new AbortController();
  activeImageFetchControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let blob: Blob;
  try {
    let currentUrl = url;
    let res: Response | null = null;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!isAllowedAvatarUrl(currentUrl)) return null;
      res = await fetch(currentUrl, {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "manual",
      });
      if (res.status < 300 || res.status >= 400) break;
      if (redirectCount === MAX_REDIRECTS) return null;
      const location = res.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).toString();
    }
    if (!res) return null;
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type");
    if (!isAllowedRasterImageContentType(contentType)) return null;

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) return null;

    const boundedBlob = await readAvatarBlobBounded(
      res,
      MAX_DOWNLOAD_BYTES,
      contentType!.split(";", 1)[0]!.trim().toLowerCase(),
    );
    if (!boundedBlob) return null;
    blob = boundedBlob;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    activeImageFetchControllers.delete(controller);
  }

  if (blob.size > MAX_DOWNLOAD_BYTES) return null;
  if (!isAllowedRasterImageContentType(blob.type)) return null;

  // Decode → raw pixels, then re-encode to WebP. Rich document image
  // formats (notably SVG) were rejected above; if raster decode fails we give
  // up rather than rendering the untrusted source URL directly.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }

  try {
    if (bitmap.width === 0 || bitmap.height === 0) return null;

    const scale = Math.min(
      TARGET_DIM / bitmap.width,
      TARGET_DIM / bitmap.height,
      1, // never upscale
    );
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const outBlob = await canvas.convertToBlob({
      type: "image/webp",
      quality: 0.85,
    });

    if (outBlob.size > MAX_ENCODED_BYTES) return null;

    const base64 = await arrayBufferToBase64(await outBlob.arrayBuffer());
    const dataUrl = `data:${outBlob.type};base64,${base64}`;

    if (expectedEpoch !== walletImageCacheEpoch) return null;
    const cache = await readCache();
    if (expectedEpoch !== walletImageCacheEpoch) return null;
    cache[url] = {
      dataUrl,
      sizeBytes: dataUrl.length,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    prune(cache);
    if (expectedEpoch !== walletImageCacheEpoch) return null;
    await writeCache(cache);

    return dataUrl;
  } finally {
    bitmap.close();
  }
}

/**
 * Returns the cached data URL if present and fresh. Avoid touch-only storage
 * writes: an old-wallet read racing reset must never repopulate the cache.
 */
export async function getCachedAvatarImage(
  url: string,
): Promise<string | null> {
  if (!url || !isAllowedAvatarUrl(url)) return null;
  const cache = await readCache();
  const entry = cache[url];
  if (!entry || !isCacheEntryValid(entry)) return null;
  return entry.dataUrl;
}

/**
 * Fetches + caches an avatar image, or returns the cached copy if already
 * present. Concurrent calls for the same URL share a single fetch.
 */
export async function fetchAndCacheAvatarImage(
  url: string,
): Promise<string | null> {
  if (!url || !isAllowedAvatarUrl(url)) return null;
  const expectedEpoch = walletImageCacheEpoch;

  const cached = await getCachedAvatarImage(url);
  if (expectedEpoch !== walletImageCacheEpoch) return null;
  if (cached) return cached;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = runQueuedImageFetch(url, expectedEpoch).finally(() => {
    if (inFlight.get(url) === promise) inFlight.delete(url);
  });
  inFlight.set(url, promise);
  return promise;
}
