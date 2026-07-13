import { CHAIN_TOKEN_IDS } from "@/constants/chainRegistry";
import {
  COINGECKO_MARKETS_API,
  COINGECKO_SEARCH_API,
} from "@/constants/externalUrls";
import { fetchJsonBounded } from "../network/boundedHttp";
import {
  getDirectCoinId,
  getNativeResolutionKey,
  getNativeSearchQueries,
  pickBestNativeSearchMatch,
} from "./coingeckoNativePolicy";
import { CoinGeckoState } from "./coingeckoState";
import type {
  CachedMarketEntry,
  CoinGeckoSearchCoin,
  NativeAssetLookupRequest,
  NativeAssetLookupResult,
} from "./coingeckoTypes";

const SEARCH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const MARKET_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const MARKET_CACHE_TTL = 5 * 60_000;
const SEARCH_CACHE_TTL = 24 * 60 * 60_000;
const RESOLUTION_CACHE_TTL = 7 * 24 * 60 * 60_000;
const MARKET_BATCH_DELAY_MS = 150;
const RATE_LIMIT_BACKOFF_MS = 60_000;

export class CoinGeckoNativeService {
  private readonly pendingMarketRequests = new Map<
    string,
    Array<{
      resolve: (value: CachedMarketEntry | undefined) => void;
      reject: (reason?: unknown) => void;
    }>
  >();
  private marketFlushTimer: number | null = null;

  constructor(private readonly state: CoinGeckoState) {}

  async getByChainId(chainId: number): Promise<NativeAssetLookupResult> {
    const coinId = CHAIN_TOKEN_IDS[chainId];
    if (!coinId) return { priceUsd: 0 };
    const market = await this.getMarketEntry(coinId);
    return {
      coinId,
      priceUsd: market?.priceUsd ?? 0,
      logoUrl: market?.logoUrl,
    };
  }

  async resolve(
    request: NativeAssetLookupRequest,
  ): Promise<NativeAssetLookupResult> {
    await this.state.ensureLoaded();
    const directId = getDirectCoinId(request);
    if (directId) {
      const market = await this.getMarketEntry(directId);
      return {
        coinId: directId,
        priceUsd: market?.priceUsd ?? 0,
        logoUrl: market?.logoUrl,
      };
    }

    const resolutionKey = getNativeResolutionKey(request);
    const cachedResolution = this.state.resolutionCache.get(resolutionKey);
    if (
      cachedResolution &&
      Date.now() - cachedResolution.fetchedAt < RESOLUTION_CACHE_TTL
    ) {
      const market = await this.getMarketEntry(cachedResolution.coinId);
      return {
        coinId: cachedResolution.coinId,
        priceUsd: market?.priceUsd ?? 0,
        logoUrl: market?.logoUrl,
      };
    }

    const results = await Promise.all(
      getNativeSearchQueries(request).map((query) => this.searchCoins(query)),
    );
    const match = pickBestNativeSearchMatch(results.flat(), request);
    if (!match?.id) return { priceUsd: 0 };

    this.state.resolutionCache.set(resolutionKey, {
      coinId: match.id,
      fetchedAt: Date.now(),
    });
    await this.state.persistResolutionCache();
    const market = await this.getMarketEntry(match.id, match);
    return {
      coinId: match.id,
      priceUsd: market?.priceUsd ?? 0,
      logoUrl: market?.logoUrl || match.large || match.thumb,
    };
  }

  async resolveBatch(
    requests: NativeAssetLookupRequest[],
  ): Promise<NativeAssetLookupResult[]> {
    return Promise.all(requests.map((request) => this.resolve(request)));
  }

  private async searchCoins(query: string): Promise<CoinGeckoSearchCoin[]> {
    await this.state.ensureLoaded();
    const normalizedQuery = query.trim().toLowerCase();
    const cached = this.state.searchCache.get(normalizedQuery);
    if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL) {
      return cached.coins;
    }
    if (Date.now() < this.state.marketBackoffUntil) {
      return cached?.coins ?? [];
    }

    try {
      const { response, data } = await fetchJsonBounded(
        `${COINGECKO_SEARCH_API}?query=${encodeURIComponent(query)}`,
        { method: "GET" },
        { timeoutMs: 5_000, maxBytes: SEARCH_RESPONSE_MAX_BYTES },
      );
      if (response.status === 429) {
        this.state.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        return cached?.coins ?? [];
      }
      if (!response.ok) return cached?.coins ?? [];
      const coins: CoinGeckoSearchCoin[] =
        data && typeof data === "object" && !Array.isArray(data)
          ? ((data as { coins?: CoinGeckoSearchCoin[] }).coins ?? [])
          : [];
      this.state.searchCache.set(normalizedQuery, {
        coins,
        fetchedAt: Date.now(),
      });
      await this.state.persistSearchCache();
      return coins;
    } catch {
      return cached?.coins ?? [];
    }
  }

  private async getMarketEntry(
    id: string,
    seed?: CoinGeckoSearchCoin,
  ): Promise<CachedMarketEntry | undefined> {
    await this.state.ensureLoaded();
    const cached = this.state.marketCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) {
      return cached;
    }
    if (seed && cached && !cached.logoUrl && (seed.large || seed.thumb)) {
      this.state.marketCache.set(id, {
        ...cached,
        logoUrl: seed.large || seed.thumb,
      });
    }

    return new Promise((resolve, reject) => {
      const waiters = this.pendingMarketRequests.get(id) || [];
      waiters.push({ resolve, reject });
      this.pendingMarketRequests.set(id, waiters);
      if (this.marketFlushTimer !== null) return;
      this.marketFlushTimer = setTimeout(() => {
        this.flushMarketRequests().catch(() => {});
      }, MARKET_BATCH_DELAY_MS) as unknown as number;
    });
  }

  private async flushMarketRequests(): Promise<void> {
    const requestEntries = new Map(this.pendingMarketRequests);
    this.pendingMarketRequests.clear();
    if (this.marketFlushTimer !== null) {
      clearTimeout(this.marketFlushTimer);
      this.marketFlushTimer = null;
    }
    const ids = [...requestEntries.keys()];
    if (ids.length === 0) return;

    if (Date.now() < this.state.marketBackoffUntil) {
      ids.forEach((id) => {
        const cached = this.state.marketCache.get(id);
        requestEntries.get(id)?.forEach(({ resolve }) => resolve(cached));
      });
      return;
    }

    try {
      const { response, data } = await fetchJsonBounded(
        `${COINGECKO_MARKETS_API}?vs_currency=usd&ids=${encodeURIComponent(
          ids.join(","),
        )}&sparkline=false&locale=en`,
        { method: "GET" },
        { timeoutMs: 5_000, maxBytes: MARKET_RESPONSE_MAX_BYTES },
      );
      if (response.status === 429) {
        this.state.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        this.resolveCachedEntries(ids, requestEntries);
        return;
      }
      if (!response.ok) {
        this.resolveCachedEntries(ids, requestEntries);
        return;
      }

      const fetchedAt = Date.now();
      const byId = new Map<string, CachedMarketEntry>();
      for (const coin of Array.isArray(data) ? data : []) {
        const entry: CachedMarketEntry = {
          priceUsd: coin.current_price ?? 0,
          logoUrl: coin.image,
          fetchedAt,
        };
        this.state.marketCache.set(coin.id, entry);
        byId.set(coin.id, entry);
      }
      await this.state.persistMarketCache();
      ids.forEach((id) => {
        const entry = byId.get(id) || this.state.marketCache.get(id);
        requestEntries.get(id)?.forEach(({ resolve }) => resolve(entry));
      });
    } catch {
      this.resolveCachedEntries(ids, requestEntries);
    }
  }

  private resolveCachedEntries(
    ids: string[],
    requests: Map<
      string,
      Array<{
        resolve: (value: CachedMarketEntry | undefined) => void;
        reject: (reason?: unknown) => void;
      }>
    >,
  ): void {
    ids.forEach((id) => {
      const cached = this.state.marketCache.get(id);
      requests.get(id)?.forEach(({ resolve }) => resolve(cached));
    });
  }
}
