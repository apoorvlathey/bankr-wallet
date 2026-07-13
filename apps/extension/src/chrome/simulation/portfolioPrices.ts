import type { PortfolioToken } from "../portfolio/api";
import { getLatestPortfolioHoldingsSnapshotForAddress } from "../portfolio/holdingsCache";

const PORTFOLIO_CACHE_TTL = 30_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** In-memory mirror of the latest reset-aware holdings snapshot. */
let portfolioCache: {
  address: string;
  tokens: PortfolioToken[];
  timestamp: number;
} | null = null;

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
    if (
      portfolioCache &&
      portfolioCache.address === normalizedAddress &&
      Date.now() - portfolioCache.timestamp < PORTFOLIO_CACHE_TTL
    ) {
      return buildPortfolioPriceMap(portfolioCache.tokens);
    }

    const snapshot =
      await getLatestPortfolioHoldingsSnapshotForAddress(accountAddress);
    if (!snapshot) return new Map();
    portfolioCache = {
      address: normalizedAddress,
      tokens: snapshot.tokens,
      timestamp: Date.now(),
    };
    return buildPortfolioPriceMap(snapshot.tokens);
  } catch {
    // Portfolio lookup is an optional pricing source.
    return new Map();
  }
}
