/**
 * Clear-signing (ERC-7730) background handler.
 *
 * Owns the chrome.storage.local cache and the network fetch from the website
 * proxy. Pure read-side — no credentials, no session restoration needed.
 *
 * Cache strategy:
 *   - Hits cached for 7 days, misses for 1 day.
 *   - Keyed by (chainId, lowercased address, kind).
 *   - User opt-out short-circuits before any storage or network access.
 */

import { WALLETCHAN_CLEAR_SIGNING_API } from "@/constants/externalUrls";
import type {
  DescriptorKind,
  Erc7730Descriptor,
} from "@/lib/clearSigning/types";

const ENABLED_KEY = "cs:enabled";
const CACHE_PREFIX = "cs:desc:";

const HIT_TTL_MS = 7 * 24 * 3600 * 1000;
const MISS_TTL_MS = 1 * 24 * 3600 * 1000;

interface CacheEntry {
  updatedAt: number;
  descriptor: Erc7730Descriptor | null;
}

function cacheKey(chainId: number, address: string, kind: DescriptorKind): string {
  return `${CACHE_PREFIX}${chainId}:${address.toLowerCase()}:${kind}`;
}

async function getEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get([ENABLED_KEY]);
  // Default ON — only OFF if user explicitly set false.
  return result[ENABLED_KEY] !== false;
}

async function readCache(
  chainId: number,
  address: string,
  kind: DescriptorKind,
): Promise<CacheEntry | null> {
  const key = cacheKey(chainId, address, kind);
  const result = await chrome.storage.local.get([key]);
  const entry = result[key] as CacheEntry | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.updatedAt;
  const ttl = entry.descriptor ? HIT_TTL_MS : MISS_TTL_MS;
  if (age > ttl) return null;
  return entry;
}

async function writeCache(
  chainId: number,
  address: string,
  kind: DescriptorKind,
  descriptor: Erc7730Descriptor | null,
): Promise<void> {
  const key = cacheKey(chainId, address, kind);
  const entry: CacheEntry = { updatedAt: Date.now(), descriptor };
  await chrome.storage.local.set({ [key]: entry });
}

async function fetchDescriptor(
  chainId: number,
  address: string,
  kind: DescriptorKind,
): Promise<Erc7730Descriptor | null> {
  const url = `${WALLETCHAN_CLEAR_SIGNING_API}?chainId=${chainId}&address=${address}&kind=${kind}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (err) {
    console.warn("[clear-signing] network error:", err);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(`[clear-signing] fetch ${url} -> ${res.status}`);
    return null;
  }
  try {
    const data = await res.json();
    if (data && typeof data === "object" && "descriptor" in data) {
      return data.descriptor as Erc7730Descriptor;
    }
    return null;
  } catch (err) {
    console.warn("[clear-signing] invalid JSON:", err);
    return null;
  }
}

export interface GetDescriptorMessage {
  type: "GET_CLEAR_SIGNING_DESCRIPTOR";
  chainId: number;
  address: string;
  kind: DescriptorKind;
}

export interface GetDescriptorResponse {
  descriptor: Erc7730Descriptor | null;
  enabled: boolean;
}

export async function handleGetClearSigningDescriptor(
  message: GetDescriptorMessage,
): Promise<GetDescriptorResponse> {
  const enabled = await getEnabled();
  if (!enabled) return { descriptor: null, enabled: false };

  const chainId = Number(message.chainId);
  const address = String(message.address || "").toLowerCase();
  const kind = message.kind;
  if (!chainId || !/^0x[0-9a-f]{40}$/.test(address)) {
    return { descriptor: null, enabled };
  }
  if (kind !== "calldata" && kind !== "eip712") {
    return { descriptor: null, enabled };
  }

  const cached = await readCache(chainId, address, kind);
  if (cached) {
    return { descriptor: cached.descriptor, enabled };
  }

  const fetched = await fetchDescriptor(chainId, address, kind);
  await writeCache(chainId, address, kind, fetched);
  return { descriptor: fetched, enabled };
}

export async function handleInvalidateClearSigningCache(): Promise<{ cleared: number }> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
  return { cleared: keys.length };
}

export async function getClearSigningEnabled(): Promise<boolean> {
  return getEnabled();
}

export async function setClearSigningEnabled(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENABLED_KEY]: !!value });
  if (!value) {
    // Drop the cache when user turns it off — feels like a stronger opt-out.
    await handleInvalidateClearSigningCache();
  }
}
