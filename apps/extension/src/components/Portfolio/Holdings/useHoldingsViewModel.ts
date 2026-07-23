import { useMemo } from "react";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { measurePortfolioPerformance } from "@/components/Portfolio/performanceDebug";
import type { HoldingsState } from "./useHoldingsState";
import {
  buildAssetDisplayRows,
  filterPortfolioTokens,
  getChainTotals,
} from "./transforms";

interface UseHoldingsViewModelOptions {
  filterChainId?: number | null;
  searchQuery: string;
  unifyBalances: boolean;
  state: HoldingsState;
}

export function useHoldingsViewModel({
  filterChainId,
  searchQuery,
  unifyBalances,
  state,
}: UseHoldingsViewModelOptions) {
  const { tokens, defiPositions } = state;
  const tokenKeys = useMemo(
    () =>
      measurePortfolioPerformance(
        "holdings-token-keys",
        { tokenCount: tokens.length },
        () =>
          new Set(
            tokens.map((token) =>
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
          ),
      ),
    [tokens],
  );
  const filteredTokens = useMemo(
    () =>
      measurePortfolioPerformance(
        "holdings-filter-tokens",
        {
          tokenCount: tokens.length,
          filterChainId: filterChainId ?? "all",
          hasSearchQuery: searchQuery.trim().length > 0,
        },
        () => filterPortfolioTokens(tokens, filterChainId, searchQuery),
      ),
    [filterChainId, searchQuery, tokens],
  );
  const { primaryAssetRows, lowValueAssetRows, lowValueTotalUsd } = useMemo(
    () =>
      measurePortfolioPerformance(
        "holdings-build-display-rows",
        {
          filteredTokenCount: filteredTokens.length,
          filterChainId: filterChainId ?? "all",
          unifyBalances,
        },
        () =>
          buildAssetDisplayRows(
            filteredTokens,
            filterChainId,
            unifyBalances,
          ),
      ),
    [filterChainId, filteredTokens, unifyBalances],
  );
  const filteredDefiPositions = useMemo(
    () =>
      measurePortfolioPerformance(
        "holdings-filter-positions",
        {
          positionCount: defiPositions.length,
          filterChainId: filterChainId ?? "all",
        },
        () =>
          filterChainId != null
            ? defiPositions.filter(
                (position) => position.chainId === filterChainId,
              )
            : defiPositions,
      ),
    [defiPositions, filterChainId],
  );
  const chainTotals = useMemo(
    () =>
      measurePortfolioPerformance(
        "holdings-chain-totals",
        {
          tokenCount: tokens.length,
          positionCount: defiPositions.length,
        },
        () =>
          getChainTotals(
            tokens,
            defiPositions,
            state.omittedTokenValueUsdByChain,
          ),
      ),
    [defiPositions, state.omittedTokenValueUsdByChain, tokens],
  );

  return {
    tokenKeys,
    primaryAssetRows,
    lowValueAssetRows,
    lowValueTotalUsd,
    filteredDefiPositions,
    chainTotals,
  };
}

export type HoldingsViewModel = ReturnType<typeof useHoldingsViewModel>;
