import type { Erc7730Descriptor } from "@/lib/clearSigning/types";
import type { DescriptorLookup } from "./types";

export const CLEAR_SIGNING_ENABLED_KEY = "cs:enabled";
export const CLEAR_SIGNING_CACHE_PREFIX = "cs:desc:";
export const CLEAR_SIGNING_CACHE_SCHEMA_VERSION = 3;
export const CLEAR_SIGNING_HIT_TTL_MS = 7 * 24 * 3600 * 1000;
export const CLEAR_SIGNING_MISS_TTL_MS = 1 * 24 * 3600 * 1000;

export interface DescriptorCacheEntry {
  schemaVersion?: number;
  updatedAt: number;
  descriptor: Erc7730Descriptor | null;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function descriptorCacheHint(lookup: DescriptorLookup): string {
  if (
    lookup.kind === "calldata" &&
    lookup.selector &&
    /^0x[0-9a-fA-F]{8}$/.test(lookup.selector)
  ) {
    return lookup.selector.toLowerCase();
  }
  if (lookup.kind === "eip712" && lookup.formatKey) {
    return `fmt:${lookup.formatKey.length}:${hashString(lookup.formatKey)}`;
  }
  return "any";
}

export function descriptorCacheKey(lookup: DescriptorLookup): string {
  return `${CLEAR_SIGNING_CACHE_PREFIX}${lookup.chainId}:${lookup.address.toLowerCase()}:${lookup.kind}:${descriptorCacheHint(lookup)}`;
}

export async function readDescriptorCache(
  lookup: DescriptorLookup,
): Promise<DescriptorCacheEntry | null> {
  const key = descriptorCacheKey(lookup);
  const result = await chrome.storage.local.get([key]);
  const entry = result[key] as DescriptorCacheEntry | undefined;
  if (!entry) return null;
  if (
    (entry.schemaVersion || 1) < CLEAR_SIGNING_CACHE_SCHEMA_VERSION
  ) {
    return null;
  }
  const age = Date.now() - entry.updatedAt;
  const ttl = entry.descriptor
    ? CLEAR_SIGNING_HIT_TTL_MS
    : CLEAR_SIGNING_MISS_TTL_MS;
  return age > ttl ? null : entry;
}

export async function writeDescriptorCache(
  lookup: DescriptorLookup,
  descriptor: Erc7730Descriptor | null,
): Promise<void> {
  const key = descriptorCacheKey(lookup);
  const entry: DescriptorCacheEntry = {
    schemaVersion: CLEAR_SIGNING_CACHE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    descriptor,
  };
  try {
    await chrome.storage.local.set({ [key]: entry });
  } catch {
    // Public metadata caches must never block clear-signing display.
  }
}

export async function handleInvalidateClearSigningCache(): Promise<{
  cleared: number;
}> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) =>
    key.startsWith(CLEAR_SIGNING_CACHE_PREFIX),
  );
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return { cleared: keys.length };
}
