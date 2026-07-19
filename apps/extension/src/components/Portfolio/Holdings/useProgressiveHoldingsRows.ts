import { useCallback, useMemo, useState } from "react";
import type { DefiPosition } from "@/chrome/portfolio/api";
import { PORTFOLIO_DATA_PAGE_SIZE } from "@/components/tokenHoldingsUtils";
import { getProgressiveHoldingsRows } from "./progressiveRowsModel";
import type { AssetDisplayRow } from "./types";

interface ProgressiveHoldingsRowsOptions {
  primaryRows: AssetDisplayRow[];
  lowValueRows: AssetDisplayRow[];
  positions: DefiPosition[];
  includeLowValueRows: boolean;
  resetKey: string;
}

export function useProgressiveHoldingsRows({
  primaryRows,
  lowValueRows,
  positions,
  includeLowValueRows,
  resetKey,
}: ProgressiveHoldingsRowsOptions) {
  const [pageState, setPageState] = useState({
    resetKey,
    visibleCount: PORTFOLIO_DATA_PAGE_SIZE,
  });
  const visibleCount =
    pageState.resetKey === resetKey
      ? pageState.visibleCount
      : PORTFOLIO_DATA_PAGE_SIZE;

  const result = useMemo(
    () =>
      getProgressiveHoldingsRows({
        primaryRows,
        lowValueRows,
        positions,
        includeLowValueRows,
        visibleCount,
      }),
    [includeLowValueRows, lowValueRows, positions, primaryRows, visibleCount],
  );

  const loadNextPage = useCallback(() => {
    setPageState((current) => ({
      resetKey,
      visibleCount:
        (current.resetKey === resetKey
          ? current.visibleCount
          : PORTFOLIO_DATA_PAGE_SIZE) + PORTFOLIO_DATA_PAGE_SIZE,
    }));
  }, [resetKey]);

  return { ...result, loadNextPage };
}
