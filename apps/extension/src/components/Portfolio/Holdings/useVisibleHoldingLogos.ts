import { useCallback, useMemo } from "react";
import type { DefiPosition } from "@/chrome/portfolio/api";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { collectTokenLogoUrls, getTokensFromRows } from "./transforms";
import type { AssetDisplayRow } from "./types";

export function useVisibleHoldingLogos(
  assetRows: AssetDisplayRow[],
  positions: DefiPosition[],
) {
  const visibleLogoUrls = useMemo(() => {
    const urls: Array<string | null | undefined> = [];
    for (const token of getTokensFromRows(assetRows)) {
      collectTokenLogoUrls(token, urls);
    }
    for (const position of positions) {
      urls.push(position.protocolLogo);
      for (const asset of position.assets ?? []) urls.push(asset.logoUrl);
      for (const asset of position.rewardAssets ?? []) urls.push(asset.logoUrl);
    }
    return urls;
  }, [assetRows, positions]);
  const cachedLogoMap = useCachedAvatarMap(visibleLogoUrls);

  return useCallback(
    (url: string | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url,
    [cachedLogoMap],
  );
}
