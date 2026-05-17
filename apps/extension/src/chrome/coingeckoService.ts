import {
  CHAIN_TOKEN_IDS,
  COINGECKO_PLATFORM_IDS,
  GECKOTERMINAL_NETWORK_IDS,
} from "@/constants/chainRegistry";
import {
  COINGECKO_MARKETS_API,
  COINGECKO_SEARCH_API,
  COINGECKO_TOKEN_PRICE_API,
  GECKOTERMINAL_TOKEN_PRICE_API,
} from "@/constants/externalUrls";

const MARKET_CACHE_STORAGE_KEY = "coingeckoMarketCache";
const SEARCH_CACHE_STORAGE_KEY = "coingeckoSearchCache";
const RESOLUTION_CACHE_STORAGE_KEY = "coingeckoNativeResolutionCache";
const ERC20_PRICE_CACHE_STORAGE_KEY = "coingeckoErc20PriceCache";

const MARKET_CACHE_TTL = 5 * 60_000;
const SEARCH_CACHE_TTL = 24 * 60 * 60_000;
const RESOLUTION_CACHE_TTL = 7 * 24 * 60 * 60_000;
const ERC20_PRICE_CACHE_TTL = 5 * 60_000;
const MARKET_BATCH_DELAY_MS = 150;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const ERC20_PRICE_BATCH_SIZE = 30;

const DIRECT_NATIVE_COINGECKO_IDS: Record<string, string> = {
  ether: "ethereum",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "binancecoin",
  binancecoin: "binancecoin",
  "binance coin": "binancecoin",
  celo: "celo",
  xdai: "xdai",
  gnosis: "xdai",
  matic: "matic-network",
  polygon: "matic-network",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  optimism: "ethereum",
  op: "ethereum",
  monad: "monad",
  mon: "monad",
};

interface CachedMarketEntry {
  priceUsd: number;
  logoUrl?: string;
  fetchedAt: number;
}

interface CoinGeckoSearchCoin {
  id: string;
  name: string;
  symbol: string;
  thumb?: string;
  large?: string;
}

interface CachedSearchEntry {
  coins: CoinGeckoSearchCoin[];
  fetchedAt: number;
}

interface CachedResolutionEntry {
  coinId: string;
  fetchedAt: number;
}

interface CachedErc20PriceEntry {
  priceUsd: number;
  fetchedAt: number;
}

export interface Erc20PriceRequest {
  chainId: number;
  contractAddress: string;
}

export interface Erc20PriceResult {
  chainId: number;
  contractAddress: string;
  priceUsd: number;
}

export interface NativeAssetLookupRequest {
  chainId?: number;
  chainName: string;
  nativeCurrencyName: string;
  symbol: string;
}

export interface NativeAssetLookupResult {
  coinId?: string;
  priceUsd: number;
  logoUrl?: string;
}

class CoinGeckoService {
  private loaded = false;
  private marketCache = new Map<string, CachedMarketEntry>();
  private searchCache = new Map<string, CachedSearchEntry>();
  private resolutionCache = new Map<string, CachedResolutionEntry>();
  private erc20PriceCache = new Map<string, CachedErc20PriceEntry>();
  private pendingMarketRequests = new Map<
    string,
    { resolve: (value: CachedMarketEntry | undefined) => void; reject: (reason?: unknown) => void }[]
  >();
  private marketFlushTimer: number | null = null;
  private marketBackoffUntil = 0;

  private async ensureLoaded() {
    if (this.loaded) return;

    const stored = await chrome.storage.local.get([
      MARKET_CACHE_STORAGE_KEY,
      SEARCH_CACHE_STORAGE_KEY,
      RESOLUTION_CACHE_STORAGE_KEY,
      ERC20_PRICE_CACHE_STORAGE_KEY,
    ]);

    Object.entries(stored[MARKET_CACHE_STORAGE_KEY] || {}).forEach(([id, entry]) => {
      this.marketCache.set(id, entry as CachedMarketEntry);
    });
    Object.entries(stored[SEARCH_CACHE_STORAGE_KEY] || {}).forEach(([query, entry]) => {
      this.searchCache.set(query, entry as CachedSearchEntry);
    });
    Object.entries(stored[RESOLUTION_CACHE_STORAGE_KEY] || {}).forEach(([key, entry]) => {
      this.resolutionCache.set(key, entry as CachedResolutionEntry);
    });
    Object.entries(stored[ERC20_PRICE_CACHE_STORAGE_KEY] || {}).forEach(([key, entry]) => {
      this.erc20PriceCache.set(key, entry as CachedErc20PriceEntry);
    });

    this.loaded = true;
  }

  async getNativeAssetByChainId(
    chainId: number,
  ): Promise<NativeAssetLookupResult> {
    const coinId = CHAIN_TOKEN_IDS[chainId];
    if (!coinId) return { priceUsd: 0 };
    const market = await this.getMarketEntry(coinId);
    return {
      coinId,
      priceUsd: market?.priceUsd ?? 0,
      logoUrl: market?.logoUrl,
    };
  }

  async resolveNativeAsset(
    request: NativeAssetLookupRequest,
  ): Promise<NativeAssetLookupResult> {
    await this.ensureLoaded();

    const directId = this.getDirectCoinId(request);
    if (directId) {
      const market = await this.getMarketEntry(directId);
      return {
        coinId: directId,
        priceUsd: market?.priceUsd ?? 0,
        logoUrl: market?.logoUrl,
      };
    }

    const resolutionKey = this.getResolutionKey(request);
    const cachedResolution = this.resolutionCache.get(resolutionKey);
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

    const queries = this.getSearchQueries(request);
    const results = await Promise.all(queries.map((query) => this.searchCoins(query)));
    const coins = results.flat();
    const match = this.pickBestSearchMatch(coins, request);

    if (!match?.id) {
      return { priceUsd: 0 };
    }

    this.resolutionCache.set(resolutionKey, {
      coinId: match.id,
      fetchedAt: Date.now(),
    });
    await this.persistResolutionCache();

    const market = await this.getMarketEntry(match.id, match);
    return {
      coinId: match.id,
      priceUsd: market?.priceUsd ?? 0,
      logoUrl: market?.logoUrl || match.large || match.thumb,
    };
  }

  async resolveNativeAssetsBatch(
    requests: NativeAssetLookupRequest[],
  ): Promise<NativeAssetLookupResult[]> {
    return Promise.all(requests.map((request) => this.resolveNativeAsset(request)));
  }

  async resolveErc20PricesBatch(
    requests: Erc20PriceRequest[],
  ): Promise<Erc20PriceResult[]> {
    await this.ensureLoaded();

    const now = Date.now();
    const toFetchByChain = new Map<number, Set<string>>();

    for (const req of requests) {
      const addr = req.contractAddress.toLowerCase();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
      const cached = this.erc20PriceCache.get(this.erc20Key(req.chainId, addr));
      if (cached && now - cached.fetchedAt < ERC20_PRICE_CACHE_TTL) continue;
      const set = toFetchByChain.get(req.chainId) ?? new Set<string>();
      set.add(addr);
      toFetchByChain.set(req.chainId, set);
    }

    if (toFetchByChain.size > 0 && now >= this.marketBackoffUntil) {
      await Promise.all(
        Array.from(toFetchByChain.entries()).map(([chainId, addrs]) =>
          this.fetchErc20PricesForChain(chainId, Array.from(addrs)),
        ),
      );
    }

    return requests.map((req) => {
      const addr = req.contractAddress.toLowerCase();
      const cached = this.erc20PriceCache.get(this.erc20Key(req.chainId, addr));
      return {
        chainId: req.chainId,
        contractAddress: addr,
        priceUsd: cached?.priceUsd ?? 0,
      };
    });
  }

  private erc20Key(chainId: number, address: string): string {
    return `${chainId}-${address.toLowerCase()}`;
  }

  private async fetchErc20PricesForChain(
    chainId: number,
    addresses: string[],
  ): Promise<void> {
    if (addresses.length === 0) return;

    const platformId = COINGECKO_PLATFORM_IDS[chainId];
    const gtNetwork = GECKOTERMINAL_NETWORK_IDS[chainId];
    const fetchedAt = Date.now();
    const priceByAddr = new Map<string, number>();

    if (platformId) {
      for (let i = 0; i < addresses.length; i += ERC20_PRICE_BATCH_SIZE) {
        const chunk = addresses.slice(i, i + ERC20_PRICE_BATCH_SIZE);
        try {
          const url = `${COINGECKO_TOKEN_PRICE_API}/${platformId}?contract_addresses=${chunk.join(",")}&vs_currencies=usd`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (res.status === 429) {
            this.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
            break;
          }
          if (!res.ok) continue;
          const data = (await res.json()) as Record<string, { usd?: number }>;
          for (const addr of chunk) {
            const price = Number(data[addr.toLowerCase()]?.usd ?? 0);
            if (price > 0) priceByAddr.set(addr.toLowerCase(), price);
          }
        } catch {
          // Try next chunk; GeckoTerminal fallback below covers misses.
        }
      }
    }

    const unresolved = addresses.filter(
      (a) => !priceByAddr.has(a.toLowerCase()),
    );

    if (gtNetwork && unresolved.length > 0) {
      for (let i = 0; i < unresolved.length; i += ERC20_PRICE_BATCH_SIZE) {
        const chunk = unresolved.slice(i, i + ERC20_PRICE_BATCH_SIZE);
        try {
          const url = `${GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}/token_price/${chunk.join(",")}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) continue;
          const data = (await res.json()) as {
            data?: { attributes?: { token_prices?: Record<string, string> } };
          };
          const prices = data?.data?.attributes?.token_prices ?? {};
          for (const addr of chunk) {
            const raw = prices[addr.toLowerCase()];
            const price = raw ? Number(raw) : 0;
            if (price > 0) priceByAddr.set(addr.toLowerCase(), price);
          }
        } catch {
          // Final fallback exhausted; remaining tokens stay at 0.
        }
      }
    }

    for (const addr of addresses) {
      const lower = addr.toLowerCase();
      this.erc20PriceCache.set(this.erc20Key(chainId, lower), {
        priceUsd: priceByAddr.get(lower) ?? 0,
        fetchedAt,
      });
    }

    await this.persistErc20PriceCache();
  }

  private getDirectCoinId(request: NativeAssetLookupRequest): string | undefined {
    if (request.chainId && CHAIN_TOKEN_IDS[request.chainId]) {
      return CHAIN_TOKEN_IDS[request.chainId];
    }

    const candidates = [
      request.chainName,
      request.nativeCurrencyName,
      request.symbol,
    ];
    for (const candidate of candidates) {
      const normalized = candidate.trim().toLowerCase();
      if (DIRECT_NATIVE_COINGECKO_IDS[normalized]) {
        return DIRECT_NATIVE_COINGECKO_IDS[normalized];
      }
    }
    return undefined;
  }

  private getResolutionKey(request: NativeAssetLookupRequest): string {
    return [
      request.chainId ?? "custom",
      request.chainName.trim().toLowerCase(),
      request.nativeCurrencyName.trim().toLowerCase(),
      request.symbol.trim().toLowerCase(),
    ].join(":");
  }

  private getSearchQueries(request: NativeAssetLookupRequest): string[] {
    return Array.from(
      new Set(
        [
          `${request.chainName} ${request.symbol}`.trim(),
          `${request.chainName} ${request.nativeCurrencyName}`.trim(),
          request.nativeCurrencyName.trim(),
          request.symbol.trim(),
          request.chainName
            .replace(/\b(testnet|mainnet|network|chain|sepolia|fuji)\b/gi, "")
            .trim(),
        ].filter(Boolean),
      ),
    );
  }

  private async searchCoins(query: string): Promise<CoinGeckoSearchCoin[]> {
    await this.ensureLoaded();

    const normalizedQuery = query.trim().toLowerCase();
    const cached = this.searchCache.get(normalizedQuery);
    if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL) {
      return cached.coins;
    }

    if (Date.now() < this.marketBackoffUntil) {
      return cached?.coins ?? [];
    }

    try {
      const res = await fetch(
        `${COINGECKO_SEARCH_API}?query=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (res.status === 429) {
        this.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        return cached?.coins ?? [];
      }
      if (!res.ok) return cached?.coins ?? [];

      const data = await res.json();
      const coins: CoinGeckoSearchCoin[] = data.coins ?? [];
      this.searchCache.set(normalizedQuery, { coins, fetchedAt: Date.now() });
      await this.persistSearchCache();
      return coins;
    } catch {
      return cached?.coins ?? [];
    }
  }

  private pickBestSearchMatch(
    coins: CoinGeckoSearchCoin[],
    request: NativeAssetLookupRequest,
  ): CoinGeckoSearchCoin | undefined {
    const targetName = request.chainName.trim().toLowerCase();
    const targetCurrencyName = request.nativeCurrencyName.trim().toLowerCase();
    const targetSymbol = request.symbol.trim().toLowerCase();

    return (
      coins.find((coin) => {
        const coinName = coin.name.trim().toLowerCase();
        const coinSymbol = coin.symbol.trim().toLowerCase();
        return (
          coinName === targetName ||
          coinName === targetCurrencyName ||
          coinSymbol === targetSymbol
        );
      }) ||
      coins.find((coin) => {
        const coinName = coin.name.trim().toLowerCase();
        const coinSymbol = coin.symbol.trim().toLowerCase();
        return (
          coinName.includes(targetCurrencyName) ||
          targetCurrencyName.includes(coinName) ||
          coinSymbol === targetSymbol
        );
      }) ||
      coins[0]
    );
  }

  private async getMarketEntry(
    id: string,
    seed?: CoinGeckoSearchCoin,
  ): Promise<CachedMarketEntry | undefined> {
    await this.ensureLoaded();

    const cached = this.marketCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) {
      return cached;
    }

    if (seed && cached && !cached.logoUrl && (seed.large || seed.thumb)) {
      this.marketCache.set(id, {
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

  private async flushMarketRequests() {
    const requestEntries = new Map(this.pendingMarketRequests);
    this.pendingMarketRequests.clear();

    if (this.marketFlushTimer !== null) {
      clearTimeout(this.marketFlushTimer);
      this.marketFlushTimer = null;
    }

    const ids = [...requestEntries.keys()];
    if (ids.length === 0) return;

    if (Date.now() < this.marketBackoffUntil) {
      ids.forEach((id) => {
        const cached = this.marketCache.get(id);
        requestEntries.get(id)?.forEach(({ resolve }) => resolve(cached));
      });
      return;
    }

    try {
      const res = await fetch(
        `${COINGECKO_MARKETS_API}?vs_currency=usd&ids=${encodeURIComponent(
          ids.join(","),
        )}&sparkline=false&locale=en`,
        { signal: AbortSignal.timeout(5_000) },
      );

      if (res.status === 429) {
        this.marketBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        ids.forEach((id) => {
          const cached = this.marketCache.get(id);
          requestEntries.get(id)?.forEach(({ resolve }) => resolve(cached));
        });
        return;
      }

      if (!res.ok) {
        ids.forEach((id) => {
          const cached = this.marketCache.get(id);
          requestEntries.get(id)?.forEach(({ resolve }) => resolve(cached));
        });
        return;
      }

      const data = await res.json();
      const fetchedAt = Date.now();
      const byId = new Map<string, CachedMarketEntry>();

      for (const coin of data as any[]) {
        const entry: CachedMarketEntry = {
          priceUsd: coin.current_price ?? 0,
          logoUrl: coin.image,
          fetchedAt,
        };
        this.marketCache.set(coin.id, entry);
        byId.set(coin.id, entry);
      }

      await this.persistMarketCache();

      ids.forEach((id) => {
        const entry = byId.get(id) || this.marketCache.get(id);
        requestEntries.get(id)?.forEach(({ resolve }) => resolve(entry));
      });
    } catch {
      ids.forEach((id) => {
        const cached = this.marketCache.get(id);
        requestEntries.get(id)?.forEach(({ resolve }) => resolve(cached));
      });
    }
  }

  private async persistMarketCache() {
    await chrome.storage.local.set({
      [MARKET_CACHE_STORAGE_KEY]: Object.fromEntries(this.marketCache),
    });
  }

  private async persistSearchCache() {
    await chrome.storage.local.set({
      [SEARCH_CACHE_STORAGE_KEY]: Object.fromEntries(this.searchCache),
    });
  }

  private async persistResolutionCache() {
    await chrome.storage.local.set({
      [RESOLUTION_CACHE_STORAGE_KEY]: Object.fromEntries(this.resolutionCache),
    });
  }

  private async persistErc20PriceCache() {
    await chrome.storage.local.set({
      [ERC20_PRICE_CACHE_STORAGE_KEY]: Object.fromEntries(this.erc20PriceCache),
    });
  }
}

const service = new CoinGeckoService();

export async function fetchNativeCoinGeckoPrice(
  chainId: number,
): Promise<number | null> {
  const result = await service.getNativeAssetByChainId(chainId);
  return result.priceUsd || null;
}

export async function resolveCoinGeckoNativeAssetsBatch(
  requests: NativeAssetLookupRequest[],
): Promise<NativeAssetLookupResult[]> {
  return service.resolveNativeAssetsBatch(requests);
}

export async function resolveCoinGeckoErc20PricesBatch(
  requests: Erc20PriceRequest[],
): Promise<Erc20PriceResult[]> {
  return service.resolveErc20PricesBatch(requests);
}

/**
 * Fetch a USD price for an ERC-20 token by (chainId, contractAddress).
 *
 * Tries CoinGecko's `/simple/token_price/{platform_id}` endpoint first (the
 * canonical price source for established tokens). When it returns no price —
 * which is common for newer / lower-cap / DEX-only tokens — falls through
 * to GeckoTerminal's onchain DEX price feed via `/simple/networks/{network}
 * /token_price/{addresses}`. Returns 0 only when both fail or the chain has
 * neither registry mapping.
 *
 * Used as a direct fallback when the walletchan proxy is unreachable.
 */
export async function fetchCoinGeckoTokenPriceDirect(
  chainId: number,
  contractAddress: string,
): Promise<number> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return 0;
  const addr = contractAddress.toLowerCase();

  const platformId = COINGECKO_PLATFORM_IDS[chainId];
  if (platformId) {
    try {
      const url = `${COINGECKO_TOKEN_PRICE_API}/${platformId}?contract_addresses=${addr}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = (await res.json()) as Record<string, { usd?: number }>;
        const price = Number(data[addr]?.usd ?? 0);
        if (price > 0) return price;
      }
    } catch {
      // Fall through to GeckoTerminal.
    }
  }

  const gtNetwork = GECKOTERMINAL_NETWORK_IDS[chainId];
  if (gtNetwork) {
    try {
      const url = `${GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}/token_price/${addr}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = (await res.json()) as {
          data?: { attributes?: { token_prices?: Record<string, string> } };
        };
        const priceStr = data?.data?.attributes?.token_prices?.[addr];
        const price = priceStr ? Number(priceStr) : 0;
        if (price > 0) return price;
      }
    } catch {
      // Final fallback exhausted.
    }
  }

  return 0;
}
