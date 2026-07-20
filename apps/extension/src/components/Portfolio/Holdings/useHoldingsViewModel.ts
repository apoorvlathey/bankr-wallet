import { useMemo } from "react";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
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
      new Set(
        tokens.map((token) =>
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
      ),
    [tokens],
  );
  const filteredTokens = useMemo(
    () => filterPortfolioTokens(tokens, filterChainId, searchQuery),
    [filterChainId, searchQuery, tokens],
  );
  const { primaryAssetRows, lowValueAssetRows, lowValueTotalUsd } = useMemo(
    () => buildAssetDisplayRows(filteredTokens, filterChainId, unifyBalances),
    [filterChainId, filteredTokens, unifyBalances],
  );
  const filteredDefiPositions = useMemo(
    () =>
      filterChainId != null
        ? defiPositions.filter((position) => position.chainId === filterChainId)
        : defiPositions,
    [defiPositions, filterChainId],
  );
  const chainTotals = useMemo(
    () =>
      getChainTotals(
        tokens,
        defiPositions,
        state.omittedTokenValueUsdByChain,
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
