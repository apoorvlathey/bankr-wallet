import type { PortfolioToken } from "../portfolio/api";
import { getLatestPortfolioHoldingsSnapshotForAddress } from "../portfolio/holdingsCache";

const PORTFOLIO_CACHE_TTL = 30_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** In-memory mirrors of reset-aware price projections, never complete rows. */
const portfolioCache = new Map<string, {
  prices: Map<string, number>;
  timestamp: number;
}>();
const portfolioInflight = new Map<string, Promise<Map<string, number>>>();
const MAX_CACHED_ACCOUNTS = 4;

export function buildPortfolioPriceMap(
  tokens: readonly PortfolioToken[],
): Map<string, number> {
  const priceMap = new Map<string, number>();
  try {
    for (const token of tokens) {
      if (token.priceUsd <= 0) continue;
      const contractKey =
        token.contractAddress === "native" ||
        token.contractAddress.toLowerCase() === ZERO_ADDRESS
          ? "native"
          : token.contractAddress.toLowerCase();
      priceMap.set(`${token.chainId}:${contractKey}`, token.priceUsd);
    }
  } catch {
    // Preserve any valid entries collected before a corrupt snapshot record.
  }
  return priceMap;
}

export async function getPortfolioPriceMap(
  accountAddress: string,
): Promise<Map<string, number>> {
  try {
    const normalizedAddress = accountAddress.toLowerCase();
    const cached = portfolioCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < PORTFOLIO_CACHE_TTL) {
      return cached.prices;
    }

    const existing = portfolioInflight.get(normalizedAddress);
    if (existing) return existing;
    const pending = (async () => {
      const snapshot =
        await getLatestPortfolioHoldingsSnapshotForAddress(accountAddress);
      const prices = buildPortfolioPriceMap(snapshot?.tokens ?? []);
      portfolioCache.delete(normalizedAddress);
      portfolioCache.set(normalizedAddress, { prices, timestamp: Date.now() });
      while (portfolioCache.size > MAX_CACHED_ACCOUNTS) {
        const oldest = portfolioCache.keys().next().value as string | undefined;
        if (!oldest) break;
        portfolioCache.delete(oldest);
      }
      return prices;
    })().finally(() => portfolioInflight.delete(normalizedAddress));
    portfolioInflight.set(normalizedAddress, pending);
    return pending;
  } catch {
    // Portfolio lookup is an optional pricing source.
    return new Map();
  }
}
