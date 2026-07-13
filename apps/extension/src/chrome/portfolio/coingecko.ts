import { CoinGeckoErc20Service } from "./coingeckoErc20";
import { CoinGeckoNativeService } from "./coingeckoNative";
import { CoinGeckoState } from "./coingeckoState";
import type {
  Erc20PriceRequest,
  Erc20PriceResult,
  NativeAssetLookupRequest,
  NativeAssetLookupResult,
} from "./coingeckoTypes";

export type {
  Erc20PriceRequest,
  Erc20PriceResult,
  NativeAssetLookupRequest,
  NativeAssetLookupResult,
} from "./coingeckoTypes";
export { fetchCoinGeckoTokenPriceDirect } from "./directTokenPricing";

const state = new CoinGeckoState();
const nativeService = new CoinGeckoNativeService(state);
const erc20Service = new CoinGeckoErc20Service(state);

export async function fetchNativeCoinGeckoPrice(
  chainId: number,
): Promise<number | null> {
  const result = await nativeService.getByChainId(chainId);
  return result.priceUsd || null;
}

export async function resolveCoinGeckoNativeAssetsBatch(
  requests: NativeAssetLookupRequest[],
): Promise<NativeAssetLookupResult[]> {
  return nativeService.resolveBatch(requests);
}

export async function resolveCoinGeckoErc20PricesBatch(
  requests: Erc20PriceRequest[],
): Promise<Erc20PriceResult[]> {
  return erc20Service.resolveBatch(requests);
}
