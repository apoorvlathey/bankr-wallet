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

const STORAGE_KEY = "ensAvatarImageCache";
const CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB cap on stored data URLs
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024; // 2 MB raw download cap
const MAX_ENCODED_BYTES = 512 * 1024; // 512 KB re-encoded cap per image
const TARGET_DIM = 128; // resize box (avatars display ≤24 px, 128 covers 4x DPI)
const FETCH_TIMEOUT_MS = 10_000;

export interface AvatarCacheEntry {
  dataUrl: string;
  sizeBytes: number;
  cachedAt: number;
  lastAccessedAt: number;
}

type AvatarCache = Record<string, AvatarCacheEntry>;

// Deduplicate concurrent fetches for the same URL within a service worker session.
const inFlight = new Map<string, Promise<string | null>>();

async function readCache(): Promise<AvatarCache> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as AvatarCache) || {};
}

async function writeCache(cache: AvatarCache): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: cache });
}

function isCacheEntryValid(entry: AvatarCacheEntry): boolean {
  return Date.now() - entry.cachedAt < CACHE_DURATION_MS;
}

function isAllowedUrl(url: string): boolean {
  // Only http(s). Reject data:, blob:, file:, chrome-extension:, ipfs:, javascript:, etc.
  // (ENS resolvers return resolved https gateway URLs for ipfs:// already.)
  return /^https?:\/\//i.test(url);
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

async function prune(cache: AvatarCache): Promise<void> {
  const now = Date.now();
  // Drop expired
  for (const [k, v] of Object.entries(cache)) {
    if (now - v.cachedAt > CACHE_DURATION_MS) delete cache[k];
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

async function doFetchAndEncode(url: string): Promise<string | null> {
  if (!isAllowedUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let blob: Blob;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      // Don't follow redirects to non-http schemes
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) return null;

    blob = await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (blob.size > MAX_DOWNLOAD_BYTES) return null;
  if (!blob.type.toLowerCase().startsWith("image/")) return null;

  // Decode → raw pixels. createImageBitmap ignores SVG <script>, CSS, etc.
  // In Chrome service workers this supports PNG, JPEG, WebP, GIF, and SVG
  // (rasterized without script execution). If decode fails we give up.
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

    const cache = await readCache();
    cache[url] = {
      dataUrl,
      sizeBytes: dataUrl.length,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    await prune(cache);
    await writeCache(cache);

    return dataUrl;
  } finally {
    bitmap.close();
  }
}

/**
 * Returns the cached data URL if present and fresh. Touches lastAccessedAt
 * so frequently-used avatars survive LRU eviction.
 */
export async function getCachedAvatarImage(
  url: string,
): Promise<string | null> {
  if (!url || !isAllowedUrl(url)) return null;
  const cache = await readCache();
  const entry = cache[url];
  if (!entry || !isCacheEntryValid(entry)) return null;
  entry.lastAccessedAt = Date.now();
  await writeCache(cache);
  return entry.dataUrl;
}

/**
 * Fetches + caches an avatar image, or returns the cached copy if already
 * present. Concurrent calls for the same URL share a single fetch.
 */
export async function fetchAndCacheAvatarImage(
  url: string,
): Promise<string | null> {
  if (!url || !isAllowedUrl(url)) return null;

  const cached = await getCachedAvatarImage(url);
  if (cached) return cached;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = doFetchAndEncode(url).finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}
