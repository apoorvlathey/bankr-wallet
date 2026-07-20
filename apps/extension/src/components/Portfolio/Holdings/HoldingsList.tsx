import type { RefObject } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import type { DefiPosition } from "@/chrome/portfolio/api";
import { DefiPositionRow } from "@/components/PortfolioHoldingRows";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import { AssetRow } from "./AssetRow";
import { LowValueAssetsSection } from "./LowValueAssetsSection";
import { ProgressiveListSentinel } from "./ProgressiveListSentinel";
import type { AssetDisplayRow, AssetRowPresentationProps } from "./types";

interface HoldingsListProps extends AssetRowPresentationProps {
  primaryAssetRows: AssetDisplayRow[];
  primaryAssetRowCount: number;
  lowValueAssetRows: AssetDisplayRow[];
  lowValueAssetRowCount: number;
  lowValueTotalUsd: number;
  filteredDefiPositions: DefiPosition[];
  defiPositionCount: number;
  loading: boolean;
  tokenCount: number;
  hideCard?: boolean;
  hasNetworkFilter: boolean;
  onShowAllNetworks?: () => void;
  searchQuery: string;
  view: "all" | "assets" | "positions";
  showLowValueTokens: boolean;
  lowValueLoading: boolean;
  lowValueDisclosureRef: RefObject<HTMLDivElement>;
  onToggleLowValueTokens: () => void;
  onLowValueAnimationComplete: () => void;
  hasMore: boolean;
  remainingCount: number;
  onLoadMore: () => void;
}

export function HoldingsList({
  primaryAssetRows,
  primaryAssetRowCount,
  lowValueAssetRows,
  lowValueAssetRowCount,
  lowValueTotalUsd,
  filteredDefiPositions,
  defiPositionCount,
  loading,
  tokenCount,
  hideCard,
  hasNetworkFilter,
  onShowAllNetworks,
  searchQuery,
  view,
  showLowValueTokens,
  lowValueLoading,
  lowValueDisclosureRef,
  onToggleLowValueTokens,
  onLowValueAnimationComplete,
  hasMore,
  remainingCount,
  onLoadMore,
  ...rowPresentation
}: HoldingsListProps) {
  const showAssets = view !== "positions";
  const showPositions = view !== "assets";
  const hasVisibleAssets =
    showAssets && (primaryAssetRowCount > 0 || lowValueAssetRowCount > 0);
  const hasAnyPositions = showPositions && defiPositionCount > 0;
  const hasRenderedPositions =
    hasAnyPositions && filteredDefiPositions.length > 0;
  const hasVisibleRows = hasVisibleAssets || hasAnyPositions;

  return (
    <ListSurface
      borderWidth={hideCard ? 0 : "1px"}
      borderRadius={hideCard ? 0 : "lg"}
      bg={hideCard ? "transparent" : "surface.raised"}
    >
      {loading && tokenCount === 0 ? (
        Array.from({ length: 3 }).map((_, index) => (
          <SkeletonRow key={index} density="default" />
        ))
      ) : !hasVisibleRows ? (
        <Box as="li" listStyleType="none">
          <EmptyState minH="144px">
            <EmptyStateHeader>
              <EmptyStateTitle>
                {view === "assets" && searchQuery.trim()
                  ? "No matching assets"
                  : view === "positions"
                    ? "No DeFi positions"
                    : view === "assets"
                      ? "No assets found"
                      : "No assets or positions"}
              </EmptyStateTitle>
              <EmptyStateDescription>
                {view === "assets" && searchQuery.trim()
                  ? "Try another token name or symbol."
                  : view === "positions"
                    ? "Positions from supported protocols will appear here."
                    : "Tokens with a balance will appear here."}
              </EmptyStateDescription>
            </EmptyStateHeader>
            {hasNetworkFilter && onShowAllNetworks && (
              <EmptyStateActions>
                <Button variant="secondary" onClick={onShowAllNetworks}>
                  View all networks
                </Button>
              </EmptyStateActions>
            )}
          </EmptyState>
        </Box>
      ) : (
        <>
          {showAssets &&
            primaryAssetRows.map((row, index) => (
              <AssetRow
                key={
                  row.kind === "aggregate"
                    ? `aggregated-${row.symbol.toLowerCase()}`
                    : `${row.token.chainId}-${row.token.contractAddress}-${index}`
                }
                row={row}
                {...rowPresentation}
              />
            ))}

          {showAssets && lowValueAssetRowCount > 0 && (
            <LowValueAssetsSection
              rows={lowValueAssetRows}
              rowCount={lowValueAssetRowCount}
              totalValueUsd={lowValueTotalUsd}
              isExpanded={showLowValueTokens}
              isLoading={lowValueLoading}
              hasVisiblePositions={hasAnyPositions}
              disclosureRef={lowValueDisclosureRef}
              onToggle={onToggleLowValueTokens}
              onAnimationComplete={onLowValueAnimationComplete}
              {...rowPresentation}
            />
          )}

          {hasRenderedPositions && view === "all" && (
            <Box
              as="li"
              px={4}
              pt={4}
              pb={2}
              listStyleType="none"
              borderBottomWidth="1px"
              borderBottomColor="border.subtle"
            >
              <Text color="fg.secondary" fontSize="sm" fontWeight={600}>
                DeFi positions
              </Text>
            </Box>
          )}

          {hasRenderedPositions &&
            filteredDefiPositions.map((position, index) => (
              <DefiPositionRow
                key={`defi-${position.protocol}-${position.name}-${index}`}
                position={position}
                hideValue={rowPresentation.hideValue}
                formatUsd={rowPresentation.formatUsd}
                resolveLogo={rowPresentation.resolveLogo}
              />
            ))}

          {hasMore && (
            <ProgressiveListSentinel
              remainingCount={remainingCount}
              onLoadMore={onLoadMore}
            />
          )}
        </>
      )}
    </ListSurface>
  );
}
