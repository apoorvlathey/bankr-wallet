import {
  COINGECKO_PLATFORM_IDS,
  GECKOTERMINAL_NETWORK_IDS,
} from "@/constants/chainRegistry";
import {
  COINGECKO_TOKEN_PRICE_API,
  GECKOTERMINAL_TOKEN_PRICE_API,
} from "@/constants/externalUrls";
import { fetchJsonBounded } from "../network/boundedHttp";
import { CoinGeckoState } from "./coingeckoState";
import type {
  Erc20PriceRequest,
  Erc20PriceResult,
} from "./coingeckoTypes";

const PRICE_RESPONSE_MAX_BYTES = 1024 * 1024;
const ERC20_PRICE_CACHE_TTL = 5 * 60_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const COINGECKO_BATCH_SIZE = 1;
const GECKOTERMINAL_BATCH_SIZE = 30;

export class CoinGeckoErc20Service {
  constructor(private readonly state: CoinGeckoState) {}

  async resolveBatch(
    requests: Erc20PriceRequest[],
  ): Promise<Erc20PriceResult[]> {
    await this.state.ensureLoaded();
    const now = Date.now();
    const toFetchByChain = new Map<number, Set<string>>();

    for (const request of requests) {
      const address = request.contractAddress.toLowerCase();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) continue;
      const cached = this.state.erc20PriceCache.get(
        this.state.erc20Key(request.chainId, address),
      );
      if (cached && now - cached.fetchedAt < ERC20_PRICE_CACHE_TTL) continue;
      const addresses = toFetchByChain.get(request.chainId) ?? new Set<string>();
      addresses.add(address);
      toFetchByChain.set(request.chainId, addresses);
    }

    if (toFetchByChain.size > 0 && now >= this.state.marketBackoffUntil) {
      await Promise.all(
        [...toFetchByChain].map(([chainId, addresses]) =>
          this.fetchForChain(chainId, [...addresses]),
        ),
      );
    }

    return requests.map((request) => {
      const address = request.contractAddress.toLowerCase();
      const cached = this.state.erc20PriceCache.get(
        this.state.erc20Key(request.chainId, address),
      );
      return {
        chainId: request.chainId,
        contractAddress: address,
        priceUsd: cached?.priceUsd ?? 0,
      };
    });
  }

  private async fetchForChain(
    chainId: number,
    addresses: string[],
  ): Promise<void> {
    if (addresses.length === 0) return;
    const platformId = COINGECKO_PLATFORM_IDS[chainId];
    const gtNetwork = GECKOTERMINAL_NETWORK_IDS[chainId];
    const fetchedAt = Date.now();
    const priceByAddress = new Map<string, number>();
    let rateLimited = false;

    if (gtNetwork) {
      for (let i = 0; i < addresses.length; i += GECKOTERMINAL_BATCH_SIZE) {
        const chunk = addresses.slice(i, i + GECKOTERMINAL_BATCH_SIZE);
        try {
          const url = `${GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}/token_price/${chunk.join(",")}`;
          const { response, data } = await fetchJsonBounded(
            url,
            { method: "GET" },
            { timeoutMs: 10_000, maxBytes: PRICE_RESPONSE_MAX_BYTES },
          );
          if (response.status === 429) {
            this.state.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
            rateLimited = true;
            break;
          }
          if (!response.ok) continue;
          const prices = (
            data as {
              data?: { attributes?: { token_prices?: Record<string, string> } };
            }
          )?.data?.attributes?.token_prices;
          for (const address of chunk) {
            const raw = prices?.[address.toLowerCase()];
            const price = raw ? Number(raw) : 0;
            if (price > 0) priceByAddress.set(address.toLowerCase(), price);
          }
        } catch {
          // CoinGecko fallback below covers GeckoTerminal misses.
        }
      }
    }

    const unresolved = addresses.filter(
      (address) => !priceByAddress.has(address.toLowerCase()),
    );
    if (!rateLimited && platformId && unresolved.length > 0) {
      await this.fetchCoinGeckoFallback(
        platformId,
        unresolved,
        priceByAddress,
      );
    }

    for (const address of addresses) {
      const normalized = address.toLowerCase();
      this.state.erc20PriceCache.set(
        this.state.erc20Key(chainId, normalized),
        { priceUsd: priceByAddress.get(normalized) ?? 0, fetchedAt },
      );
    }
    await this.state.persistErc20PriceCache();
  }

  private async fetchCoinGeckoFallback(
    platformId: string,
    addresses: string[],
    prices: Map<string, number>,
  ): Promise<void> {
    for (let i = 0; i < addresses.length; i += COINGECKO_BATCH_SIZE) {
      const chunk = addresses.slice(i, i + COINGECKO_BATCH_SIZE);
      try {
        const url = `${COINGECKO_TOKEN_PRICE_API}/${platformId}?contract_addresses=${chunk.join(",")}&vs_currencies=usd`;
        const { response, data } = await fetchJsonBounded(
          url,
          { method: "GET" },
          { timeoutMs: 10_000, maxBytes: PRICE_RESPONSE_MAX_BYTES },
        );
        if (response.status === 429) {
          this.state.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
          break;
        }
        if (!response.ok) continue;
        const parsed = data as Record<string, { usd?: number }>;
        for (const address of chunk) {
          const normalized = address.toLowerCase();
          const price = Number(parsed[normalized]?.usd ?? 0);
          if (price > 0) prices.set(normalized, price);
        }
      } catch {
        // Final fallback exhausted; unresolved tokens remain at zero.
      }
    }
  }
}
