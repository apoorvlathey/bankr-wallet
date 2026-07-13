import {
  COINGECKO_PLATFORM_IDS,
  GECKOTERMINAL_NETWORK_IDS,
} from "@/constants/chainRegistry";
import {
  COINGECKO_TOKEN_PRICE_API,
  GECKOTERMINAL_TOKEN_PRICE_API,
} from "@/constants/externalUrls";
import { fetchJsonBounded } from "../network/boundedHttp";

const PRICE_RESPONSE_MAX_BYTES = 1024 * 1024;

/** Direct fallback used when the WalletChan portfolio proxy is unavailable. */
export async function fetchCoinGeckoTokenPriceDirect(
  chainId: number,
  contractAddress: string,
): Promise<number> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return 0;
  const address = contractAddress.toLowerCase();
  const platformId = COINGECKO_PLATFORM_IDS[chainId];

  if (platformId) {
    try {
      const url = `${COINGECKO_TOKEN_PRICE_API}/${platformId}?contract_addresses=${address}&vs_currencies=usd`;
      const { response, data } = await fetchJsonBounded(
        url,
        { method: "GET" },
        { timeoutMs: 10_000, maxBytes: PRICE_RESPONSE_MAX_BYTES },
      );
      if (response.ok) {
        const price = Number(
          (data as Record<string, { usd?: number }>)[address]?.usd ?? 0,
        );
        if (price > 0) return price;
      }
    } catch {
      // Fall through to GeckoTerminal.
    }
  }

  const gtNetwork = GECKOTERMINAL_NETWORK_IDS[chainId];
  if (gtNetwork) {
    try {
      const url = `${GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}/token_price/${address}`;
      const { response, data } = await fetchJsonBounded(
        url,
        { method: "GET" },
        { timeoutMs: 10_000, maxBytes: PRICE_RESPONSE_MAX_BYTES },
      );
      if (response.ok) {
        const raw = (
          data as {
            data?: { attributes?: { token_prices?: Record<string, string> } };
          }
        )?.data?.attributes?.token_prices?.[address];
        const price = raw ? Number(raw) : 0;
        if (price > 0) return price;
      }
    } catch {
      // Final fallback exhausted.
    }
  }

  return 0;
}
