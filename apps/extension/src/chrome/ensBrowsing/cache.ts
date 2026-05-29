// Persisted cache of ENS/address → contenthash resolutions, keyed by lowercased
// ENS name or raw 0x address. On cache hit the interstitial redirects
// immediately; the SW then re-resolves in the background and, if the fresh
// value differs, updates the cache + pushes a `ens-content-updated` message to
// the banner (local-gateway path only).
//
// Two cache flavours coexist:
//   - ipfs / ipns: `value` is the contenthash itself (CID or IPNS name).
//   - web3 (ERC-4804): `value` is either the contract address (when routing
//     via w3eth.io) or the IPFS CID produced after pinning the onchain HTML
//     to Kubo (when `pinOnchainHtml` is ON). `contractAddress` is also
//     stored so a refresh can re-fetch from the same contract.
//
// Ported from dapp3 `src/lib/cache.ts`. TTL adjusted from 7d → 1h per the
// WalletChan spec; storage key renamed from `resolveCache` →
// `ensResolveCache` to avoid collision with other features.

import { encodeIpnsLabel } from "./gateway";
import type { ResolveKind } from "./types";

export type CachedResolve = {
  ensName: string;
  kind: ResolveKind;
  value: string;
  resolvedAt: number;
  contractAddress?: `0x${string}`;
  title?: string;
  favicon?: string;
};

export const ENS_RESOLVE_CACHE_KEY = "ensResolveCache";

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 500;

type CacheMap = Record<string, CachedResolve>;

function normalizeCacheKey(name: string): string {
  const lower = name.toLowerCase().replace(/\.$/, "");
  const rawAddressLabel = lower.match(/^(0x[a-f0-9]{40})\.eth$/);
  if (rawAddressLabel?.[1]) return rawAddressLabel[1];
  return lower;
}

async function readMap(): Promise<CacheMap> {
  const raw = await chrome.storage.local.get(ENS_RESOLVE_CACHE_KEY);
  return (raw[ENS_RESOLVE_CACHE_KEY] as CacheMap | undefined) ?? {};
}

export async function getCached(name: string): Promise<CachedResolve | null> {
  const lower = normalizeCacheKey(name);
  const map = await readMap();
  const entry = map[lower];
  if (!entry) return null;
  if (Date.now() - entry.resolvedAt > MAX_AGE_MS) return null;
  return entry;
}

export async function setCached(entry: CachedResolve): Promise<void> {
  const lower = normalizeCacheKey(entry.ensName);
  const map = await readMap();
  const existing = map[lower];
  map[lower] = { ...existing, ...entry, ensName: lower };
  const values = Object.values(map);
  if (values.length > MAX_ENTRIES) {
    const kept = values
      .sort((a, b) => b.resolvedAt - a.resolvedAt)
      .slice(0, MAX_ENTRIES);
    const next: CacheMap = {};
    for (const e of kept) next[e.ensName] = e;
    await chrome.storage.local.set({ [ENS_RESOLVE_CACHE_KEY]: next });
    return;
  }
  await chrome.storage.local.set({ [ENS_RESOLVE_CACHE_KEY]: map });
}

export async function listCached(limit = 8): Promise<CachedResolve[]> {
  const now = Date.now();
  const map = await readMap();
  return Object.values(map)
    .filter((entry) => now - entry.resolvedAt <= MAX_AGE_MS)
    .sort((a, b) => b.resolvedAt - a.resolvedAt)
    .slice(0, limit);
}

export async function updateCachedMetadata(
  ensName: string,
  metadata: { title?: string; favicon?: string },
): Promise<void> {
  const lower = normalizeCacheKey(ensName);
  const map = await readMap();
  const entry = map[lower];
  if (!entry) return;
  const title = metadata.title?.trim();
  const favicon = metadata.favicon?.trim();
  map[lower] = {
    ...entry,
    ...(title ? { title } : {}),
    ...(favicon ? { favicon } : {}),
  };
  await chrome.storage.local.set({ [ENS_RESOLVE_CACHE_KEY]: map });
}

export async function findCachedByGatewayLabel(
  kind: "ipfs" | "ipns",
  label: string,
): Promise<CachedResolve | null> {
  const map = await readMap();
  const needle = label.toLowerCase();
  for (const entry of Object.values(map)) {
    const matchesKind =
      kind === "ipns"
        ? entry.kind === "ipns"
        : entry.kind === "ipfs" || entry.kind === "web3";
    if (!matchesKind) continue;
    const entryLabel =
      entry.kind === "ipns" ? encodeIpnsLabel(entry.value) : entry.value;
    if (entryLabel.toLowerCase() === needle) return entry;
  }
  return null;
}

export async function clearCached(name: string): Promise<void> {
  const lower = normalizeCacheKey(name);
  const map = await readMap();
  if (!(lower in map)) return;
  delete map[lower];
  await chrome.storage.local.set({ [ENS_RESOLVE_CACHE_KEY]: map });
}

export async function clearAllCached(): Promise<void> {
  await chrome.storage.local.remove(ENS_RESOLVE_CACHE_KEY);
}
