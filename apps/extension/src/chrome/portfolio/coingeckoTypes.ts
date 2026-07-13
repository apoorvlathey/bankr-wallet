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

export interface CachedMarketEntry {
  priceUsd: number;
  logoUrl?: string;
  fetchedAt: number;
}

export interface CoinGeckoSearchCoin {
  id: string;
  name: string;
  symbol: string;
  thumb?: string;
  large?: string;
}

export interface CachedSearchEntry {
  coins: CoinGeckoSearchCoin[];
  fetchedAt: number;
}

export interface CachedResolutionEntry {
  coinId: string;
  fetchedAt: number;
}

export interface CachedErc20PriceEntry {
  priceUsd: number;
  fetchedAt: number;
}
