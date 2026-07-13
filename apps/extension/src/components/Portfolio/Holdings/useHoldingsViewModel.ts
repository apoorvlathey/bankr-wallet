import { useCallback, useMemo } from "react";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import type { HoldingsState } from "./useHoldingsState";
import {
  buildAssetDisplayRows,
  collectTokenLogoUrls,
  filterPortfolioTokens,
  getChainTotals,
  getTokensFromRows,
} from "./transforms";

interface UseHoldingsViewModelOptions {
  filterChainId?: number | null;
  searchQuery: string;
  showLowValueTokens: boolean;
  state: HoldingsState;
}

export function useHoldingsViewModel({
  filterChainId,
  searchQuery,
  showLowValueTokens,
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
    () => buildAssetDisplayRows(filteredTokens, filterChainId),
    [filterChainId, filteredTokens],
  );
  const primaryTokens = useMemo(
    () => getTokensFromRows(primaryAssetRows),
    [primaryAssetRows],
  );
  const lowValueTokens = useMemo(
    () => getTokensFromRows(lowValueAssetRows),
    [lowValueAssetRows],
  );
  const filteredDefiPositions = useMemo(
    () =>
      filterChainId != null
        ? defiPositions.filter((position) => position.chainId === filterChainId)
        : defiPositions,
    [defiPositions, filterChainId],
  );
  const visibleLogoUrls = useMemo(() => {
    const urls: Array<string | null | undefined> = [];
    for (const token of primaryTokens) collectTokenLogoUrls(token, urls);
    if (showLowValueTokens) {
      for (const token of lowValueTokens) collectTokenLogoUrls(token, urls);
    }
    for (const position of filteredDefiPositions) {
      urls.push(position.protocolLogo);
      for (const asset of position.assets ?? []) urls.push(asset.logoUrl);
      for (const asset of position.rewardAssets ?? []) urls.push(asset.logoUrl);
    }
    return urls;
  }, [filteredDefiPositions, lowValueTokens, primaryTokens, showLowValueTokens]);
  const cachedLogoMap = useCachedAvatarMap(visibleLogoUrls);
  const resolveLogo = useCallback(
    (url: string | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url,
    [cachedLogoMap],
  );
  const chainTotals = useMemo(
    () => getChainTotals(tokens, defiPositions),
    [defiPositions, tokens],
  );

  return {
    tokenKeys,
    primaryAssetRows,
    lowValueAssetRows,
    lowValueTotalUsd,
    lowValueTokens,
    filteredDefiPositions,
    resolveLogo,
    chainTotals,
  };
}

export type HoldingsViewModel = ReturnType<typeof useHoldingsViewModel>;
