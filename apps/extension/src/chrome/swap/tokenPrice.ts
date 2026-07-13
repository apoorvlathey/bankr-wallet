import {
  SWAP_API_BASE,
  TOKEN_PRICE_RESPONSE_MAX_BYTES,
} from "./constants";
import { fetchSwapJson } from "./transport";

export async function fetchTokenPrice(
  chainId: number,
  tokenAddress: string,
): Promise<number> {
  try {
    const { response, data } = await fetchSwapJson<{ priceUsd?: unknown }>(
      `${SWAP_API_BASE}/token-price?chainId=${chainId}&address=${tokenAddress}`,
      { timeoutMs: 10_000, maxBytes: TOKEN_PRICE_RESPONSE_MAX_BYTES },
    );
    if (response.ok) {
      const priceUsd = Number(data.priceUsd ?? 0);
      if (priceUsd > 0) return priceUsd;
    }
  } catch {
    // Fall through to direct CoinGecko.
  }

  const { fetchCoinGeckoTokenPriceDirect } = await import(
    "../portfolio/coingecko"
  );
  return fetchCoinGeckoTokenPriceDirect(chainId, tokenAddress);
}
