import {
  SWAP_API_BASE,
  SWAP_CATALOG_RESPONSE_MAX_BYTES,
  SWAP_REQUEST_TIMEOUT_MS,
  TOKEN_LIST_CACHE_TTL_MS,
} from "./constants";
import { mergePinnedTokens } from "./tokenListPolicy";
import { fetchSwapJson } from "./transport";
import type { TokenListEntry } from "./types";

interface CachedTokenList {
  tokens: TokenListEntry[];
  fetchedAt: number;
}

export function tokenListCacheKey(chainId: number): string {
  return `swapTokenList:${chainId}`;
}

export async function getCachedTokenList(
  chainId: number,
): Promise<TokenListEntry[]> {
  const key = tokenListCacheKey(chainId);
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key] as CachedTokenList | undefined;
  if (cached && Date.now() - cached.fetchedAt < TOKEN_LIST_CACHE_TTL_MS) {
    return mergePinnedTokens(chainId, cached.tokens);
  }

  try {
    const { response, data } = await fetchSwapJson<{
      tokens?: TokenListEntry[];
    }>(`${SWAP_API_BASE}/token-list?chainId=${chainId}`, {
      timeoutMs: SWAP_REQUEST_TIMEOUT_MS,
      maxBytes: SWAP_CATALOG_RESPONSE_MAX_BYTES,
    });
    if (!response.ok) return mergePinnedTokens(chainId, cached?.tokens ?? []);
    const tokens: TokenListEntry[] = data.tokens ?? [];
    try {
      await chrome.storage.local.set({
        [key]: { tokens, fetchedAt: Date.now() } satisfies CachedTokenList,
      });
    } catch {
      // Cache writes are best-effort; return the fetched list anyway.
    }
    return mergePinnedTokens(chainId, tokens);
  } catch {
    return mergePinnedTokens(chainId, cached?.tokens ?? []);
  }
}
