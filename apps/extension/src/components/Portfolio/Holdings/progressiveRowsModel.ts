import type { DefiPosition } from "@/chrome/portfolio/api";
import type { AssetDisplayRow } from "./types";

interface ProgressiveRowsInput {
  primaryRows: AssetDisplayRow[];
  lowValueRows: AssetDisplayRow[];
  positions: DefiPosition[];
  includeLowValueRows: boolean;
  visibleCount: number;
}

export function getProgressiveHoldingsRows({
  primaryRows,
  lowValueRows,
  positions,
  includeLowValueRows,
  visibleCount,
}: ProgressiveRowsInput) {
  let remaining = Math.max(0, visibleCount);
  const visiblePrimaryRows = primaryRows.slice(0, remaining);
  remaining -= visiblePrimaryRows.length;

  const visibleLowValueRows =
    remaining > 0 && includeLowValueRows
      ? lowValueRows.slice(0, remaining)
      : [];
  remaining -= visibleLowValueRows.length;

  const precedingRowsComplete =
    visiblePrimaryRows.length === primaryRows.length &&
    (!includeLowValueRows || visibleLowValueRows.length === lowValueRows.length);
  const visiblePositions = precedingRowsComplete
    ? positions.slice(0, Math.max(0, remaining))
    : [];
  const totalVisibleCandidates =
    primaryRows.length +
    (includeLowValueRows ? lowValueRows.length : 0) +
    positions.length;

  return {
    visiblePrimaryRows,
    visibleLowValueRows,
    visiblePositions,
    hasMore: visibleCount < totalVisibleCandidates,
    remainingCount: Math.max(0, totalVisibleCandidates - visibleCount),
  };
}
