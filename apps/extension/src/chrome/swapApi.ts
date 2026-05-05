/**
 * Swap API layer — calls walletchan.com server-side proxy endpoints
 * for 0x Swap API v2 (AllowanceHolder flow). Multi-chain support.
 */
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  type Address,
} from "viem";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import {
  WALLETCHAN_SWAP_API_BASE,
  WALLETCHAN_ICON_URL,
} from "@/constants/externalUrls";
import { getRpcUrl } from "./txHandlers";
import { getStoredResolvedChainById } from "@/lib/chains";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const DEFAULT_SLIPPAGE_BPS = 500; // 5%
export const SLIPPAGE_PRESETS = [100, 300, 500]; // 1%, 3%, 5%

const SWAP_API_BASE = WALLETCHAN_SWAP_API_BASE;
const RPC_TIMEOUT = 8_000;
const TOKEN_LIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Native currency info per chain (for token info resolution)
const NATIVE_CURRENCY_INFO: Record<
  number,
  { name: string; symbol: string; decimals: number }
> = {};
for (const c of CHAIN_REGISTRY) {
  NATIVE_CURRENCY_INFO[c.chainId] = c.nativeCurrency;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwapQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  gas: string;
  gasPrice: string;
  totalNetworkFee: string;
  liquidityAvailable: boolean;
  minBuyAmount: string;
  allowanceTarget: string;
  issues: {
    allowance?: {
      spender: string;
      actual: string;
      expected: string;
    };
    balance?: {
      token: string;
      actual: string;
      expected: string;
    };
    permit2Approval?: {
      token: string;
      spender: string;
    };
  };
  fees: {
    integratorFee?: {
      amount: string;
      token: string;
      type: string;
    };
    zeroExFee?: {
      amount: string;
      token: string;
      type: string;
    };
  };
  route: {
    fills: Array<{
      from: string;
      to: string;
      source: string;
      proportionBps: string;
    }>;
  };
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  /** True when the taker qualifies for reduced premium fees (sWCHAN staker) */
  isPremiumFee?: boolean;
}

export interface SwapPriceParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string; // wei
  taker?: string;
  slippageBps?: number;
}

export interface SwapQuoteParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string; // wei
  taker: string;
  slippageBps?: number;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
}

export interface TokenListEntry {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function fetchSwapPrice(
  params: SwapPriceParams,
): Promise<SwapQuoteResponse> {
  const qs = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
  });
  if (params.taker) qs.set("taker", params.taker);
  if (params.slippageBps !== undefined)
    qs.set("slippageBps", params.slippageBps.toString());

  const res = await fetch(`${SWAP_API_BASE}/price?${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || data.reason || `API error ${res.status}`);
  return data;
}

export async function fetchSwapQuote(
  params: SwapQuoteParams,
): Promise<SwapQuoteResponse> {
  const qs = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });
  if (params.slippageBps !== undefined)
    qs.set("slippageBps", params.slippageBps.toString());

  const res = await fetch(`${SWAP_API_BASE}/quote?${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || data.reason || `API error ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// Token Info (on-chain multicall)
// ---------------------------------------------------------------------------

export async function fetchTokenInfo(
  tokenAddress: string,
  chainId: number,
): Promise<TokenInfo | null> {
  // Native token — return chain-specific currency info
  if (
    tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    tokenAddress === "0x0000000000000000000000000000000000000000"
  ) {
    if (NATIVE_CURRENCY_INFO[chainId]) return NATIVE_CURRENCY_INFO[chainId];
    const customChain = await getStoredResolvedChainById(chainId);
    if (customChain?.nativeCurrency) return customChain.nativeCurrency;
    return { name: "Ether", symbol: "ETH", decimals: 18 };
  }

  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });

  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "name",
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    return { name, symbol, decimals };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token Allowance Check (on-chain)
// ---------------------------------------------------------------------------

export async function getTokenBalanceWei(
  tokenAddress: string,
  owner: string,
  chainId: number,
): Promise<bigint> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return 0n;

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });

  try {
    return await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner as Address],
    });
  } catch {
    return 0n;
  }
}

export async function checkTokenAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainId: number,
): Promise<bigint> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return 0n;

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });

  try {
    return await client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner as Address, spender as Address],
    });
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Token List (cached in chrome.storage.local)
// ---------------------------------------------------------------------------

interface CachedTokenList {
  tokens: TokenListEntry[];
  fetchedAt: number;
}

/** Tokens we manually pin into the swap token list per chain. The 0x token
 *  list doesn't always pick these up (too new, niche, or proprietary), so we
 *  guarantee they appear by merging at the swapApi layer — every consumer
 *  (Send dropdown, You Sell, You Buy) sees them automatically. */
const EXTRA_TOKENS_PER_CHAIN: Record<number, TokenListEntry[]> = {
  // Base
  8453: [
    {
      address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
      name: "WalletChan",
      symbol: "WCHAN",
      decimals: 18,
      logoURI: WALLETCHAN_ICON_URL,
    },
  ],
};

/** Merge in our pinned tokens. Pinned entries override the API entry for the
 *  same address (so our canonical logo/name win when the API has a stale
 *  record), and unmatched pinned entries are prepended — consumers that
 *  sort the list will reorder them naturally. */
function mergePinnedTokens(
  chainId: number,
  apiTokens: TokenListEntry[],
): TokenListEntry[] {
  const pinned = EXTRA_TOKENS_PER_CHAIN[chainId];
  if (!pinned || pinned.length === 0) return apiTokens;
  const pinnedByAddr = new Map(
    pinned.map((t) => [t.address.toLowerCase(), t]),
  );
  const seen = new Set<string>();
  const merged: TokenListEntry[] = [];
  for (const t of pinned) {
    merged.push(t);
    seen.add(t.address.toLowerCase());
  }
  for (const t of apiTokens) {
    const addr = t.address.toLowerCase();
    if (seen.has(addr)) continue;
    if (pinnedByAddr.has(addr)) continue;
    merged.push(t);
  }
  return merged;
}

export async function getCachedTokenList(
  chainId: number,
): Promise<TokenListEntry[]> {
  const key = `swapTokenList:${chainId}`;

  // Check cache
  const stored = await chrome.storage.local.get(key);
  const cached: CachedTokenList | undefined = stored[key];
  if (cached && Date.now() - cached.fetchedAt < TOKEN_LIST_CACHE_TTL) {
    return mergePinnedTokens(chainId, cached.tokens);
  }

  // Fetch fresh
  try {
    const res = await fetch(
      `${SWAP_API_BASE}/token-list?chainId=${chainId}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return mergePinnedTokens(chainId, cached?.tokens ?? []);
    const data = await res.json();
    const tokens: TokenListEntry[] = data.tokens ?? [];

    // Cache the raw API response — pinning happens at read time so changes
    // to EXTRA_TOKENS_PER_CHAIN take effect without invalidating the cache.
    await chrome.storage.local.set({
      [key]: { tokens, fetchedAt: Date.now() } satisfies CachedTokenList,
    });

    return mergePinnedTokens(chainId, tokens);
  } catch {
    return mergePinnedTokens(chainId, cached?.tokens ?? []);
  }
}

// ---------------------------------------------------------------------------
// Token Price (USD via CoinGecko, proxied through walletchan.com with a
// direct CoinGecko fallback when the proxy is unreachable or returns 0)
// ---------------------------------------------------------------------------

export async function fetchTokenPrice(
  chainId: number,
  tokenAddress: string,
): Promise<number> {
  try {
    const res = await fetch(
      `${SWAP_API_BASE}/token-price?chainId=${chainId}&address=${tokenAddress}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) {
      const data = await res.json();
      const priceUsd = Number(data.priceUsd ?? 0);
      if (priceUsd > 0) return priceUsd;
    }
  } catch {
    // Fall through to direct CoinGecko.
  }

  // Direct CoinGecko fallback so price still resolves when the proxy is
  // down (e.g. portfolio API outage takes the same backend with it).
  const { fetchCoinGeckoTokenPriceDirect } = await import("./coingeckoService");
  return fetchCoinGeckoTokenPriceDirect(chainId, tokenAddress);
}

// ---------------------------------------------------------------------------
// Approval TX Builder
// ---------------------------------------------------------------------------

export function buildApprovalTx(
  tokenAddress: string,
  spender: string,
  amount: bigint,
): { to: string; data: string; value: string } {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as Address, amount],
  });
  return { to: tokenAddress, data, value: "0x0" };
}

// ---------------------------------------------------------------------------
// Permit2 Allowance Check + Approval Builder
// ---------------------------------------------------------------------------

const PERMIT2_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export async function checkPermit2Allowance(
  token: string,
  owner: string,
  spender: string,
  chainId: number,
): Promise<{ amount: bigint; expiration: number }> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return { amount: 0n, expiration: 0 };

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 0 }),
  });

  try {
    const [amount, expiration] = await client.readContract({
      address: PERMIT2_ADDRESS as Address,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [owner as Address, token as Address, spender as Address],
    });
    return { amount, expiration };
  } catch {
    return { amount: 0n, expiration: 0 };
  }
}

export function buildPermit2ApproveTx(
  permit2Address: string,
  token: string,
  spender: string,
  amount: bigint,
): { to: string; data: string; value: string } {
  // Max uint160 approval, 30 days expiration
  const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const maxUint160 = (1n << 160n) - 1n;
  const approveAmount = amount > maxUint160 ? maxUint160 : amount;

  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "approve",
    args: [
      token as Address,
      spender as Address,
      approveAmount,
      expiration,
    ],
  });
  return { to: permit2Address, data, value: "0x0" };
}
