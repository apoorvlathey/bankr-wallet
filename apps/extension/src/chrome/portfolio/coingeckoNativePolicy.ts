import { CHAIN_TOKEN_IDS } from "@/constants/chainRegistry";
import type {
  CoinGeckoSearchCoin,
  NativeAssetLookupRequest,
} from "./coingeckoTypes";

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

export function getDirectCoinId(
  request: NativeAssetLookupRequest,
): string | undefined {
  if (request.chainId && CHAIN_TOKEN_IDS[request.chainId]) {
    return CHAIN_TOKEN_IDS[request.chainId];
  }
  for (const candidate of [
    request.chainName,
    request.nativeCurrencyName,
    request.symbol,
  ]) {
    const normalized = candidate.trim().toLowerCase();
    if (DIRECT_NATIVE_COINGECKO_IDS[normalized]) {
      return DIRECT_NATIVE_COINGECKO_IDS[normalized];
    }
  }
  return undefined;
}

export function getNativeResolutionKey(
  request: NativeAssetLookupRequest,
): string {
  return [
    request.chainId ?? "custom",
    request.chainName.trim().toLowerCase(),
    request.nativeCurrencyName.trim().toLowerCase(),
    request.symbol.trim().toLowerCase(),
  ].join(":");
}

export function getNativeSearchQueries(
  request: NativeAssetLookupRequest,
): string[] {
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

export function pickBestNativeSearchMatch(
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
