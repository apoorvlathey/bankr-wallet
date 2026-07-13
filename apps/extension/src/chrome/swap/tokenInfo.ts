import { erc20Abi, type Address } from "viem";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import {
  NATIVE_TOKEN_ADDRESS,
  TOKEN_METADATA_CACHE_TTL_MS,
} from "./constants";
import { createSwapPublicClient } from "./rpcClient";
import type { TokenInfo } from "./types";

const TOKEN_INFO_CACHE_PREFIX = "tokenInfo:";
const NATIVE_CURRENCY_INFO: Record<number, TokenInfo> = {};
for (const chain of CHAIN_REGISTRY) {
  NATIVE_CURRENCY_INFO[chain.chainId] = chain.nativeCurrency;
}

interface CachedTokenInfo {
  data: TokenInfo;
  fetchedAt: number;
}

export function tokenInfoCacheKey(chainId: number, address: string): string {
  return `${TOKEN_INFO_CACHE_PREFIX}${chainId}:${address.toLowerCase()}`;
}

const inflightTokenInfo = new Map<string, Promise<TokenInfo | null>>();

export async function fetchTokenInfo(
  tokenAddress: string,
  chainId: number,
): Promise<TokenInfo | null> {
  if (
    tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    tokenAddress === "0x0000000000000000000000000000000000000000"
  ) {
    if (NATIVE_CURRENCY_INFO[chainId]) return NATIVE_CURRENCY_INFO[chainId];
    const customChain = await getStoredResolvedChainById(chainId);
    if (customChain?.nativeCurrency) return customChain.nativeCurrency;
    return { name: "Ether", symbol: "ETH", decimals: 18 };
  }

  const cacheKey = tokenInfoCacheKey(chainId, tokenAddress);
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey] as CachedTokenInfo | undefined;
  if (
    cached &&
    Date.now() - cached.fetchedAt < TOKEN_METADATA_CACHE_TTL_MS
  ) {
    return cached.data;
  }

  const inflight = inflightTokenInfo.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchTokenInfoOnchain(tokenAddress, chainId)
    .then(async (data) => {
      if (data) {
        try {
          await chrome.storage.local.set({
            [cacheKey]: { data, fetchedAt: Date.now() } satisfies CachedTokenInfo,
          });
        } catch {
          // Cache writes are best-effort; live RPC data is still usable.
        }
      }
      return data;
    })
    .finally(() => {
      inflightTokenInfo.delete(cacheKey);
    });
  inflightTokenInfo.set(cacheKey, promise);
  return promise;
}

async function fetchTokenInfoOnchain(
  tokenAddress: string,
  chainId: number,
): Promise<TokenInfo | null> {
  const client = await createSwapPublicClient(chainId);
  if (!client) return null;

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
