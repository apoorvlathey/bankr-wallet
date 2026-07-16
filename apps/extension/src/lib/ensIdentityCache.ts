import { getAddress, isAddress, type Address } from "viem";
import { resolveEnsIdentitiesBatch } from "./ensBatchIdentity";
import { resolveEnsIdentity, sanitizeResolvedName } from "./ensUtils";

// ============================================================================
// Types
// ============================================================================

export interface EnsIdentityCacheEntry {
  name: string | null;
  avatar: string | null;
  resolvedAt: number; // Date.now()
  /** A forward-resolved contact name was cached, but its avatar still needs lookup. */
  needsAvatar?: boolean;
}

export type EnsIdentityCache = Record<string, EnsIdentityCacheEntry>;

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = "ensIdentityCache";
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

// ============================================================================
// Cache Utilities
// ============================================================================

export function isCacheValid(entry: EnsIdentityCacheEntry): boolean {
  return !entry.needsAvatar && Date.now() - entry.resolvedAt < CACHE_DURATION;
}

export async function getEnsIdentityCache(): Promise<EnsIdentityCache> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const raw = (result[CACHE_KEY] as EnsIdentityCache) || {};
  // Defense-in-depth: entries written before the unicode-sanitization patch may
  // still hold hazardous names. Re-sanitize on every read so legacy caches
  // can't bypass the new guard until the 6h TTL expires.
  for (const addr of Object.keys(raw)) {
    raw[addr] = { ...raw[addr], name: sanitizeResolvedName(raw[addr].name) };
  }
  return raw;
}

async function saveEnsIdentityCache(cache: EnsIdentityCache): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function resolveAndCacheIdentity(
  address: string
): Promise<{ name: string | null; avatar: string | null }> {
  const lowerAddress = address.toLowerCase();

  const { name, avatar } = await resolveEnsIdentity(address);

  const cache = await getEnsIdentityCache();
  cache[lowerAddress] = { name, avatar, resolvedAt: Date.now() };
  await saveEnsIdentityCache(cache);

  return { name, avatar };
}

export async function resolveAndCacheIdentities(
  addresses: string[],
): Promise<Map<string, { name: string | null; avatar: string | null }>> {
  const validAddresses = addresses
    .filter((address) => isAddress(address, { strict: false }))
    .map((address) => getAddress(address) as Address);
  if (validAddresses.length === 0) return new Map();

  const cache = await getEnsIdentityCache();
  const knownNames = new Map<string, string>();
  for (const address of validAddresses) {
    const entry = cache[address.toLowerCase()];
    if (!entry?.needsAvatar) continue;
    const name = sanitizeResolvedName(entry.name);
    if (name) knownNames.set(address.toLowerCase(), name);
  }

  const resolved = await resolveEnsIdentitiesBatch(validAddresses, knownNames);
  const resolvedAt = Date.now();
  for (const [address, identity] of resolved) {
    cache[address] = { ...identity, resolvedAt };
  }
  await saveEnsIdentityCache(cache);
  return resolved;
}

export async function cacheIdentityNameHint(address: string, name: string): Promise<void> {
  const sanitizedName = sanitizeResolvedName(name.trim().toLowerCase());
  if (!isAddress(address, { strict: false }) || !sanitizedName) return;
  const lowerAddress = getAddress(address).toLowerCase();
  const cache = await getEnsIdentityCache();
  const existing = cache[lowerAddress];
  cache[lowerAddress] = {
    name: sanitizedName,
    avatar: existing?.name === sanitizedName ? existing.avatar : null,
    resolvedAt: Date.now(),
    needsAvatar: !existing?.avatar || existing.name !== sanitizedName,
  };
  await saveEnsIdentityCache(cache);
}
