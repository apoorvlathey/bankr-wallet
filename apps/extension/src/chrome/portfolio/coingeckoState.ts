import type {
  CachedErc20PriceEntry,
  CachedMarketEntry,
  CachedResolutionEntry,
  CachedSearchEntry,
} from "./coingeckoTypes";

const MARKET_CACHE_STORAGE_KEY = "coingeckoMarketCache";
const SEARCH_CACHE_STORAGE_KEY = "coingeckoSearchCache";
const RESOLUTION_CACHE_STORAGE_KEY = "coingeckoNativeResolutionCache";
const ERC20_PRICE_CACHE_STORAGE_KEY = "coingeckoErc20PriceCache";

export class CoinGeckoState {
  readonly marketCache = new Map<string, CachedMarketEntry>();
  readonly searchCache = new Map<string, CachedSearchEntry>();
  readonly resolutionCache = new Map<string, CachedResolutionEntry>();
  readonly erc20PriceCache = new Map<string, CachedErc20PriceEntry>();
  marketBackoffUntil = 0;
  private loaded = false;

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const stored = await chrome.storage.local.get([
      MARKET_CACHE_STORAGE_KEY,
      SEARCH_CACHE_STORAGE_KEY,
      RESOLUTION_CACHE_STORAGE_KEY,
      ERC20_PRICE_CACHE_STORAGE_KEY,
    ]);
    Object.entries(stored[MARKET_CACHE_STORAGE_KEY] || {}).forEach(
      ([id, entry]) => this.marketCache.set(id, entry as CachedMarketEntry),
    );
    Object.entries(stored[SEARCH_CACHE_STORAGE_KEY] || {}).forEach(
      ([query, entry]) =>
        this.searchCache.set(query, entry as CachedSearchEntry),
    );
    Object.entries(stored[RESOLUTION_CACHE_STORAGE_KEY] || {}).forEach(
      ([key, entry]) =>
        this.resolutionCache.set(key, entry as CachedResolutionEntry),
    );
    Object.entries(stored[ERC20_PRICE_CACHE_STORAGE_KEY] || {}).forEach(
      ([key, entry]) =>
        this.erc20PriceCache.set(key, entry as CachedErc20PriceEntry),
    );
    this.loaded = true;
  }

  erc20Key(chainId: number, address: string): string {
    return `${chainId}-${address.toLowerCase()}`;
  }

  async persistMarketCache(): Promise<void> {
    await this.persist(MARKET_CACHE_STORAGE_KEY, this.marketCache);
  }

  async persistSearchCache(): Promise<void> {
    await this.persist(SEARCH_CACHE_STORAGE_KEY, this.searchCache);
  }

  async persistResolutionCache(): Promise<void> {
    await this.persist(RESOLUTION_CACHE_STORAGE_KEY, this.resolutionCache);
  }

  async persistErc20PriceCache(): Promise<void> {
    await this.persist(ERC20_PRICE_CACHE_STORAGE_KEY, this.erc20PriceCache);
  }

  private async persist<T>(
    key: string,
    values: ReadonlyMap<string, T>,
  ): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: Object.fromEntries(values) });
    } catch {
      // Cache persistence is best-effort; live in-memory results remain valid.
    }
  }
}
