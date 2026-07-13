import type { DefiPosition, PortfolioToken } from "@/chrome/portfolio/api";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import {
  CANONICAL_USDC_BY_CHAIN_ID,
  CANONICAL_USDT_BY_CHAIN_ID,
} from "@/constants/canonicalTokens";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import {
  LOW_VALUE_TOKEN_THRESHOLD_USD,
  getPortfolioTokenBalance,
  getTokenKeySet,
  hasPositiveBalance,
  isNativePortfolioToken,
  sortTokensByValue,
} from "@/components/tokenHoldingsUtils";
import type { AssetDisplayRow } from "./types";

const MIN_PRIMARY_TOKEN_ROWS = 4;
const BUILT_IN_ETH_MAINNET_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter(
    (chain) => chain.nativeCurrency.symbol === "ETH",
  ).map((chain) => chain.chainId),
);

export function hasRenderablePortfolioToken(token: PortfolioToken): boolean {
  return hasPositiveBalance(token) || Number(token.valueUsd || 0) > 0;
}

function isVisibleTokenRow(
  token: PortfolioToken,
  includeLowValueTokens: boolean,
): boolean {
  return (
    includeLowValueTokens ||
    Number(token.valueUsd || 0) >= LOW_VALUE_TOKEN_THRESHOLD_USD
  );
}

export function getVisibleTokenKeySet(
  tokens: PortfolioToken[],
  includeLowValueTokens: boolean,
): Set<string> {
  return getTokenKeySet(
    tokens.filter((token) => isVisibleTokenRow(token, includeLowValueTokens)),
  );
}

export function collectTokenLogoUrls(
  token: PortfolioToken,
  urls: Array<string | null | undefined>,
): void {
  urls.push(token.logoUrl);
}

export function mergeTokenEnrichment(
  currentTokens: PortfolioToken[],
  enrichedTokens: PortfolioToken[],
): PortfolioToken[] {
  const enrichedByKey = new Map(
    enrichedTokens.map((token) => [
      getPortfolioTokenKey(token.chainId, token.contractAddress),
      token,
    ]),
  );
  const seen = new Set<string>();

  const merged = currentTokens.map((token) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    seen.add(key);
    const enriched = enrichedByKey.get(key);
    if (!enriched) return token;

    const priceUsd = enriched.priceUsd > 0 ? enriched.priceUsd : token.priceUsd;
    const balanceNum = parseFloat(token.balance || "0");
    return {
      ...token,
      symbol: token.symbol || enriched.symbol,
      name: token.name || enriched.name,
      decimals: token.decimals ?? enriched.decimals,
      logoUrl: token.logoUrl || enriched.logoUrl,
      priceUsd,
      valueUsd:
        priceUsd > 0 && balanceNum > 0
          ? balanceNum * priceUsd
          : token.valueUsd || enriched.valueUsd,
    };
  });

  for (const enriched of enrichedTokens) {
    const key = getPortfolioTokenKey(enriched.chainId, enriched.contractAddress);
    if (!seen.has(key) && hasPositiveBalance(enriched)) {
      merged.push(enriched);
    }
  }

  return sortTokensByValue(merged.filter(hasPositiveBalance));
}

export function filterPortfolioTokens(
  tokens: PortfolioToken[],
  filterChainId: number | null | undefined,
  searchQuery: string,
): PortfolioToken[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  return tokens.filter((token) => {
    if (filterChainId != null && token.chainId !== filterChainId) return false;
    if (!normalizedQuery) return true;
    return (
      token.name.toLocaleLowerCase().includes(normalizedQuery) ||
      token.symbol.toLocaleLowerCase().includes(normalizedQuery)
    );
  });
}

export function buildAssetDisplayRows(
  filteredTokens: PortfolioToken[],
  filterChainId: number | null | undefined,
): {
  primaryAssetRows: AssetDisplayRow[];
  lowValueAssetRows: AssetDisplayRow[];
  lowValueTotalUsd: number;
} {
  const ethTokens =
    filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            isNativePortfolioToken(token) &&
            token.symbol.toUpperCase() === "ETH" &&
            BUILT_IN_ETH_MAINNET_CHAIN_IDS.has(token.chainId),
        )
      : [];
  const usdcTokens =
    filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            CANONICAL_USDC_BY_CHAIN_ID.get(token.chainId) ===
            token.contractAddress.toLowerCase(),
        )
      : [];
  const usdtTokens =
    filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            CANONICAL_USDT_BY_CHAIN_ID.get(token.chainId) ===
            token.contractAddress.toLowerCase(),
        )
      : [];
  const aggregateGroups = [
    { symbol: "ETH" as const, tokens: ethTokens },
    { symbol: "USDC" as const, tokens: usdcTokens },
    { symbol: "USDT" as const, tokens: usdtTokens },
  ].filter((group) => group.tokens.length > 1);
  const aggregatedTokenKeys = new Set(
    aggregateGroups.flatMap((group) =>
      group.tokens.map((token) =>
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
    ),
  );
  const displayRows: AssetDisplayRow[] = filteredTokens
    .filter(
      (token) =>
        !aggregatedTokenKeys.has(
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
    )
    .map((token) => ({ kind: "token", token, valueUsd: token.valueUsd }));

  for (const group of aggregateGroups) {
    displayRows.push({
      kind: "aggregate",
      symbol: group.symbol,
      tokens: group.tokens,
      valueUsd: group.tokens.reduce((sum, token) => sum + token.valueUsd, 0),
    });
  }

  displayRows.sort((a, b) => b.valueUsd - a.valueUsd);
  const primaryAssetRows: AssetDisplayRow[] = [];
  const lowValueAssetRows: AssetDisplayRow[] = [];

  for (const [index, row] of displayRows.entries()) {
    const belongsInLowValueGroup =
      displayRows.length > MIN_PRIMARY_TOKEN_ROWS &&
      index >= MIN_PRIMARY_TOKEN_ROWS &&
      row.valueUsd < LOW_VALUE_TOKEN_THRESHOLD_USD;
    (belongsInLowValueGroup ? lowValueAssetRows : primaryAssetRows).push(row);
  }

  return {
    primaryAssetRows,
    lowValueAssetRows,
    lowValueTotalUsd: lowValueAssetRows.reduce(
      (sum, row) => sum + row.valueUsd,
      0,
    ),
  };
}

export function getTokensFromRows(rows: AssetDisplayRow[]): PortfolioToken[] {
  return rows.flatMap((row) =>
    row.kind === "token" ? [row.token] : row.tokens,
  );
}

export function getChainTotals(
  tokens: PortfolioToken[],
  defiPositions: DefiPosition[],
): ReadonlyMap<number, number> {
  const totals = new Map<number, number>();
  for (const token of tokens) {
    totals.set(
      token.chainId,
      (totals.get(token.chainId) ?? 0) + Math.max(0, token.valueUsd || 0),
    );
  }
  for (const position of defiPositions) {
    totals.set(
      position.chainId,
      (totals.get(position.chainId) ?? 0) +
        Math.max(0, position.valueUsd || 0),
    );
  }
  return totals;
}

export { getPortfolioTokenBalance };
