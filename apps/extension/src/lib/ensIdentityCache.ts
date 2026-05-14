import { resolveEnsIdentity, sanitizeResolvedName } from "./ensUtils";

// ============================================================================
// Types
// ============================================================================

export interface EnsIdentityCacheEntry {
  name: string | null;
  avatar: string | null;
  resolvedAt: number; // Date.now()
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
  return Date.now() - entry.resolvedAt < CACHE_DURATION;
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
