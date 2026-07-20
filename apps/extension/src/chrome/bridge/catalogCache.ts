import { WALLETCHAN_BRIDGE_API_BASE, WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import { BASE_CHAIN_ID, WCHAN_TOKEN_ADDRESS } from "@walletchan/shared/contracts";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeChain,
  type BungeeChainsResponse,
  type BungeeToken,
  type BungeeTokenListResponse,
} from "@walletchan/shared/bungee";
import {
  BRIDGE_CATALOG_RESPONSE_MAX_BYTES,
  fetchBridgeJson,
} from "./client";
import { decodeBridgeTokenList } from "./catalogPolicy";

const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const BUNGEE_CHAINS_CACHE_KEY = "bungeeChains";

interface CachedBungeeChains {
  chains: BungeeChain[];
  fetchedAt: number;
}

const inflightChains: { promise: Promise<BungeeChain[]> | null } = {
  promise: null,
};

export async function getCachedBungeeChains(): Promise<BungeeChain[]> {
  const stored = await chrome.storage.local.get(BUNGEE_CHAINS_CACHE_KEY);
  const cached = stored[BUNGEE_CHAINS_CACHE_KEY] as
    | CachedBungeeChains
    | undefined;
  if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS) {
    return cached.chains;
  }

  if (inflightChains.promise) return inflightChains.promise;
  inflightChains.promise = (async () => {
    try {
      const { response, data } = await fetchBridgeJson<BungeeChainsResponse>(
        `${WALLETCHAN_BRIDGE_API_BASE}/chains`,
        BRIDGE_CATALOG_RESPONSE_MAX_BYTES,
      );
      if (!response.ok) return cached?.chains ?? [];
      const chains = data.result ?? [];
      await chrome.storage.local.set({
        [BUNGEE_CHAINS_CACHE_KEY]: {
          chains,
          fetchedAt: Date.now(),
        } satisfies CachedBungeeChains,
      });
      return chains;
    } catch {
      return cached?.chains ?? [];
    } finally {
      inflightChains.promise = null;
    }
  })();
  return inflightChains.promise;
}

interface CachedBungeeTokens {
  tokens: BungeeToken[];
  fetchedAt: number;
}

export function bungeeTokensCacheKey(chainId: number): string {
  return `bungeeTokens:${chainId}`;
}

const inflightTokens = new Map<number, Promise<BungeeToken[]>>();
const EXTRA_TOKENS_PER_CHAIN: Record<number, BungeeToken[]> = {
  [BASE_CHAIN_ID]: [
    {
      address: WCHAN_TOKEN_ADDRESS,
      name: "WalletChan",
      symbol: "WCHAN",
      decimals: 18,
      logoURI: WALLETCHAN_ICON_URL,
      chainId: BASE_CHAIN_ID,
    },
  ],
};

/** Adds pinned tokens at read time without changing the released cache shape. */
export function mergePinnedBridgeTokens(
  chainId: number,
  apiTokens: BungeeToken[],
): BungeeToken[] {
  const boundedTokens = decodeBridgeTokenList(apiTokens);
  const pinned = EXTRA_TOKENS_PER_CHAIN[chainId];
  if (!pinned || pinned.length === 0) return boundedTokens;
  const pinnedAddresses = new Set(
    pinned.map((token) => token.address.toLowerCase()),
  );
  return [
    ...pinned,
    ...boundedTokens.filter(
      (token) => !pinnedAddresses.has(token.address.toLowerCase()),
    ),
  ];
}

export async function getCachedBungeeTokens(
  chainId: number,
): Promise<BungeeToken[]> {
  const key = bungeeTokensCacheKey(chainId);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key] as CachedBungeeTokens | undefined;
  if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS) {
    return mergePinnedBridgeTokens(chainId, cached.tokens);
  }

  const inflight = inflightTokens.get(chainId);
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const { response, data } =
        await fetchBridgeJson<BungeeTokenListResponse>(
          `${WALLETCHAN_BRIDGE_API_BASE}/tokens?chainId=${chainId}`,
          BRIDGE_CATALOG_RESPONSE_MAX_BYTES,
        );
      if (!response.ok) {
        return mergePinnedBridgeTokens(chainId, cached?.tokens ?? []);
      }
      const tokens = decodeBridgeTokenList(
        (data.result ?? {})[String(chainId)],
      );
      await chrome.storage.local.set({
        [key]: { tokens, fetchedAt: Date.now() } satisfies CachedBungeeTokens,
      });
      return mergePinnedBridgeTokens(chainId, tokens);
    } catch {
      return mergePinnedBridgeTokens(chainId, cached?.tokens ?? []);
    } finally {
      inflightTokens.delete(chainId);
    }
  })();
  inflightTokens.set(chainId, promise);
  return promise;
}

export function isNativeToken(token: string): boolean {
  return token.toLowerCase() === BUNGEE_NATIVE_TOKEN.toLowerCase();
}
