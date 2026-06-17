/**
 * Bridge API layer — calls WalletChan server-side proxy endpoints
 * for Bungee (cross-chain). The proxy holds the BUNGEE_API_KEY +
 * affiliate id, normalizes the native-token sentinel, and applies the
 * sWCHAN-tiered integrator fee. See `_docs/BRIDGE.md`.
 *
 * Mirrors the shape of `swapApi.ts`: stateless fetch helpers + chrome.storage
 * caching for chain/token list data.
 */

import { WALLETCHAN_BRIDGE_API_BASE, WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import { WCHAN_TOKEN_ADDRESS, BASE_CHAIN_ID } from "@walletchan/shared/contracts";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeBuildTxResponse,
  type BungeeChain,
  type BungeeChainsResponse,
  type BungeeQuoteResponse,
  type BungeeStatusResponse,
  type BungeeToken,
  type BungeeTokenListResponse,
} from "@walletchan/shared/bungee";

const BRIDGE_API_BASE = WALLETCHAN_BRIDGE_API_BASE;
const REQUEST_TIMEOUT = 15_000;
const CHAINS_CACHE_TTL = 24 * 60 * 60 * 1000;
const TOKENS_CACHE_TTL = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Quote / build-tx / status
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
  /** Slippage in percent (e.g. 1 = 1%). Bungee's quote slippage param is percent. */
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

  const res = await fetch(`${BRIDGE_API_BASE}/quote?${qs}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.reason || `API error ${res.status}`);
  }
  return data;
}

export async function fetchBridgeBuildTx(
  quoteId: string,
): Promise<BungeeBuildTxResponse> {
  const res = await fetch(`${BRIDGE_API_BASE}/build-tx?quoteId=${encodeURIComponent(quoteId)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.reason || `API error ${res.status}`);
  }
  return data;
}

export interface BridgeStatusParams {
  requestHash?: string;
  txHash?: string;
}

export async function fetchBridgeStatus(
  params: BridgeStatusParams,
): Promise<BungeeStatusResponse> {
  const qs = new URLSearchParams();
  if (params.requestHash) qs.set("requestHash", params.requestHash);
  if (params.txHash) qs.set("txHash", params.txHash);
  const res = await fetch(`${BRIDGE_API_BASE}/status?${qs}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.reason || `API error ${res.status}`);
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
      const res = await fetch(`${BRIDGE_API_BASE}/chains`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!res.ok) {
        return cached?.chains ?? [];
      }
      const data: BungeeChainsResponse = await res.json();
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
      const res = await fetch(
        `${BRIDGE_API_BASE}/tokens?chainId=${chainId}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT) },
      );
      if (!res.ok) {
        return mergePinnedTokens(chainId, cached?.tokens ?? []);
      }
      const data: BungeeTokenListResponse = await res.json();
      // Bungee's /tokens/list is keyed by chainId string.
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
