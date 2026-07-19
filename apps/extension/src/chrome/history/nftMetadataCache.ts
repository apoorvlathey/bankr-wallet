import { isAllowedRemoteImageUrl } from "@/lib/remoteImagePolicy";

const STORAGE_KEY = "historyNftMetadataCache";
const MAX_ENTRIES = 500;
const MAX_BYTES = 10 * 1024 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000;

export interface HistoryNftDisplayMetadata {
  name?: string;
  collectionName?: string;
  symbol?: string;
  image?: string;
  historical: boolean;
}

interface CacheEntry extends HistoryNftDisplayMetadata {
  cachedAt: number;
  lastAccessedAt: number;
  sizeBytes: number;
}

type Cache = Record<string, CacheEntry>;
const memory = new Map<string, { value: HistoryNftDisplayMetadata; expiresAt: number }>();
let cacheWriteQueue: Promise<void> = Promise.resolve();

function validEntry(value: unknown, now: number): value is CacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CacheEntry>;
  return typeof entry.cachedAt === "number" &&
    typeof entry.lastAccessedAt === "number" &&
    typeof entry.sizeBytes === "number" &&
    now - entry.cachedAt < TTL_MS;
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function displayMetadata(entry: CacheEntry): HistoryNftDisplayMetadata {
  return {
    name: boundedString(entry.name, 256),
    collectionName: boundedString(entry.collectionName, 256),
    symbol: boundedString(entry.symbol, 64),
    image:
      typeof entry.image === "string" && isAllowedRemoteImageUrl(entry.image)
        ? entry.image
        : undefined,
    historical: entry.historical === true,
  };
}

async function readCache(): Promise<Cache> {
  const stored: Record<string, unknown> = await chrome.storage.local
    .get(STORAGE_KEY)
    .catch(() => ({}));
  const value = stored[STORAGE_KEY];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Cache)
    : {};
}

export async function getCachedHistoryNftMetadata(
  key: string,
): Promise<HistoryNftDisplayMetadata | null> {
  const now = Date.now();
  const inMemory = memory.get(key);
  if (inMemory && inMemory.expiresAt > now) return inMemory.value;
  const cache = await readCache();
  const entry = cache[key];
  if (!validEntry(entry, now)) return null;
  const metadata = displayMetadata(entry);
  memory.set(key, { value: metadata, expiresAt: now + TTL_MS });
  return metadata;
}

export async function cacheHistoryNftMetadata(
  key: string,
  metadata: HistoryNftDisplayMetadata,
): Promise<void> {
  const now = Date.now();
  memory.set(key, { value: metadata, expiresAt: now + TTL_MS });
  cacheWriteQueue = cacheWriteQueue
    .catch(() => undefined)
    .then(() => persistHistoryNftMetadata(key, metadata, now));
  return cacheWriteQueue;
}

async function persistHistoryNftMetadata(
  key: string,
  metadata: HistoryNftDisplayMetadata,
  now: number,
): Promise<void> {
  // Inline image data is session-only. Public HTTPS sources cross the existing
  // bounded raster cache before the renderer displays them.
  const persistent: HistoryNftDisplayMetadata = {
    ...metadata,
    image:
      metadata.image && isAllowedRemoteImageUrl(metadata.image)
        ? metadata.image
        : undefined,
  };
  const cache = await readCache();
  for (const [candidate, entry] of Object.entries(cache)) {
    if (!validEntry(entry, now)) delete cache[candidate];
  }
  const entry = {
    ...persistent,
    cachedAt: now,
    lastAccessedAt: now,
    sizeBytes: 0,
  } as CacheEntry;
  entry.sizeBytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
  cache[key] = entry;
  const ordered = Object.entries(cache).sort(
    (left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt,
  );
  let total = ordered.reduce((sum, [, value]) => sum + value.sizeBytes, 0);
  while ((ordered.length > MAX_ENTRIES || total > MAX_BYTES) && ordered.length) {
    const [candidate, value] = ordered.shift()!;
    total -= value.sizeBytes;
    delete cache[candidate];
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: cache }).catch(() => undefined);
}

export async function clearHistoryNftMetadataCache(): Promise<void> {
  memory.clear();
  await cacheWriteQueue.catch(() => undefined);
  await chrome.storage.local.remove(STORAGE_KEY);
}
