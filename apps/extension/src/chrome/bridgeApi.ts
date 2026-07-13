/**
 * Bridge API layer — calls WalletChan server-side proxy endpoints
 * for Socket Swap V3. The proxy holds the Socket/Bungee API key +
 * affiliate id, normalizes the native-token sentinel, and applies the
 * sWCHAN-tiered integrator fee. See `_docs/BRIDGE.md`.
 *
 * Mirrors the shape of `swapApi.ts`: stateless fetch helpers + chrome.storage
 * caching for chain/token list data.
 */

import { WALLETCHAN_BRIDGE_API_BASE, WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import { WCHAN_TOKEN_ADDRESS, BASE_CHAIN_ID } from "@walletchan/shared/contracts";
import { fetchTextBounded } from "./boundedHttpResponse";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeChain,
  type BungeeChainsResponse,
  type BungeeQuoteResponse,
  type BungeeStatusResponse,
  type BungeeToken,
  type BungeeTokenListResponse,
} from "@walletchan/shared/bungee";

const BRIDGE_API_BASE = WALLETCHAN_BRIDGE_API_BASE;
const REQUEST_TIMEOUT = 15_000;
const QUOTE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const CATALOG_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const CHAINS_CACHE_TTL = 24 * 60 * 60 * 1000;
const TOKENS_CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchBridgeJson<T>(
  url: string,
  maxBytes: number,
): Promise<{ response: Response; data: T }> {
  const { response, text } = await fetchTextBounded(
    url,
    { method: "GET" },
    { timeoutMs: REQUEST_TIMEOUT, maxBytes },
  );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Bridge API returned invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bridge API returned an invalid response");
  }
  return { response, data: data as T };
}

function bridgeApiError(
  data: { error?: unknown; reason?: unknown },
  status: number,
): string {
  const remote =
    typeof data.error === "string"
      ? data.error
      : typeof data.reason === "string"
        ? data.reason
        : `API error ${status}`;
  return remote.slice(0, 1_000);
}

// ---------------------------------------------------------------------------
// Quote / status
// ---------------------------------------------------------------------------

export interface BridgeQuoteParams {
  userAddress: string;
  /** Defaults to userAddress when omitted. */
  receiverAddress?: string;
  originChainId: number;
  destinationChainId: number;
  /** Input token address — native is the universal mixed-case sentinel. */
  inputToken: string;
  outputToken: string;
  /** Input amount in wei. */
  inputAmount: string;
  /** Slippage in percent (e.g. 1 = 1%). Socket's quote slippage param is percent. */
  slippage?: number;
}

export async function fetchBridgeQuote(
  params: BridgeQuoteParams,
): Promise<BungeeQuoteResponse> {
  const qs = new URLSearchParams({
    userAddress: params.userAddress,
    receiverAddress: params.receiverAddress ?? params.userAddress,
    originChainId: params.originChainId.toString(),
    destinationChainId: params.destinationChainId.toString(),
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    inputAmount: params.inputAmount,
  });
  if (params.slippage !== undefined) qs.set("slippage", String(params.slippage));

  const { response, data } = await fetchBridgeJson<
    BungeeQuoteResponse & { error?: string; reason?: string }
  >(`${BRIDGE_API_BASE}/quote?${qs}`, QUOTE_RESPONSE_MAX_BYTES);
  if (!response.ok) {
    throw new Error(bridgeApiError(data, response.status));
  }
  return data;
}

export interface BridgeStatusParams {
  /** Historical field name; Socket V3 expects this value to be the quoteId. */
  requestHash?: string;
  txHash?: string;
}

export async function fetchBridgeStatus(
  params: BridgeStatusParams,
): Promise<BungeeStatusResponse> {
  const qs = new URLSearchParams();
  if (params.requestHash) qs.set("requestHash", params.requestHash);
  if (params.txHash) qs.set("txHash", params.txHash);
  const { response, data } = await fetchBridgeJson<
    BungeeStatusResponse & { error?: string; reason?: string }
  >(`${BRIDGE_API_BASE}/status?${qs}`, QUOTE_RESPONSE_MAX_BYTES);
  if (!response.ok) {
    throw new Error(bridgeApiError(data, response.status));
  }
  return data;
}

// ---------------------------------------------------------------------------
// Supported chains (24h chrome.storage.local cache)
// ---------------------------------------------------------------------------

interface CachedBungeeChains {
  chains: BungeeChain[];
  fetchedAt: number;
}

const CHAINS_CACHE_KEY = "bungeeChains";
const inflightChains: { p: Promise<BungeeChain[]> | null } = { p: null };

export async function getCachedBungeeChains(): Promise<BungeeChain[]> {
  const stored = await chrome.storage.local.get(CHAINS_CACHE_KEY);
  const cached = stored[CHAINS_CACHE_KEY] as CachedBungeeChains | undefined;
  if (cached && Date.now() - cached.fetchedAt < CHAINS_CACHE_TTL) {
    return cached.chains;
  }

  if (inflightChains.p) return inflightChains.p;
  inflightChains.p = (async () => {
    try {
      const { response, data } = await fetchBridgeJson<BungeeChainsResponse>(
        `${BRIDGE_API_BASE}/chains`,
        CATALOG_RESPONSE_MAX_BYTES,
      );
      if (!response.ok) {
        return cached?.chains ?? [];
      }
      const chains = data.result ?? [];
      await chrome.storage.local.set({
        [CHAINS_CACHE_KEY]: { chains, fetchedAt: Date.now() } satisfies CachedBungeeChains,
      });
      return chains;
    } catch {
      return cached?.chains ?? [];
    } finally {
      inflightChains.p = null;
    }
  })();
  return inflightChains.p;
}

// ---------------------------------------------------------------------------
// Per-chain token list (24h chrome.storage.local cache per chain)
// ---------------------------------------------------------------------------

interface CachedBungeeTokens {
  tokens: BungeeToken[];
  fetchedAt: number;
}

function tokensCacheKey(chainId: number): string {
  return `bungeeTokens:${chainId}`;
}

const inflightTokens = new Map<number, Promise<BungeeToken[]>>();

/** Pin our WCHAN on Base so it always appears in the bridge picker. */
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

function mergePinnedTokens(
  chainId: number,
  apiTokens: BungeeToken[],
): BungeeToken[] {
  const pinned = EXTRA_TOKENS_PER_CHAIN[chainId];
  if (!pinned || pinned.length === 0) return apiTokens;
  const pinnedAddrs = new Set(pinned.map((t) => t.address.toLowerCase()));
  const merged: BungeeToken[] = [...pinned];
  for (const t of apiTokens) {
    if (pinnedAddrs.has(t.address.toLowerCase())) continue;
    merged.push(t);
  }
  return merged;
}

export async function getCachedBungeeTokens(
  chainId: number,
): Promise<BungeeToken[]> {
  const key = tokensCacheKey(chainId);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key] as CachedBungeeTokens | undefined;
  if (cached && Date.now() - cached.fetchedAt < TOKENS_CACHE_TTL) {
    return mergePinnedTokens(chainId, cached.tokens);
  }

  const inflight = inflightTokens.get(chainId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const { response, data } = await fetchBridgeJson<BungeeTokenListResponse>(
        `${BRIDGE_API_BASE}/tokens?chainId=${chainId}`,
        CATALOG_RESPONSE_MAX_BYTES,
      );
      if (!response.ok) {
        return mergePinnedTokens(chainId, cached?.tokens ?? []);
      }
      // Socket's /tokens/list is keyed by chainId string.
      const byChain = data.result ?? {};
      const tokens = byChain[String(chainId)] ?? [];
      await chrome.storage.local.set({
        [key]: { tokens, fetchedAt: Date.now() } satisfies CachedBungeeTokens,
      });
      return mergePinnedTokens(chainId, tokens);
    } catch {
      return mergePinnedTokens(chainId, cached?.tokens ?? []);
    } finally {
      inflightTokens.delete(chainId);
    }
  })();
  inflightTokens.set(chainId, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when `token` is the universal native sentinel (case-insensitive). */
export function isNativeToken(token: string): boolean {
  return token.toLowerCase() === BUNGEE_NATIVE_TOKEN.toLowerCase();
}
