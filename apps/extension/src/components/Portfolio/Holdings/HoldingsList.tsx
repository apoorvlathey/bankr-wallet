import type { RefObject } from "react";
import { Box, Text } from "@chakra-ui/react";
import type { DefiPosition } from "@/chrome/portfolio/api";
import { DefiPositionRow } from "@/components/PortfolioHoldingRows";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import { AssetRow } from "./AssetRow";
import { LowValueAssetsSection } from "./LowValueAssetsSection";
import type { AssetDisplayRow, AssetRowPresentationProps } from "./types";

interface HoldingsListProps extends AssetRowPresentationProps {
  primaryAssetRows: AssetDisplayRow[];
  lowValueAssetRows: AssetDisplayRow[];
  lowValueTotalUsd: number;
  filteredDefiPositions: DefiPosition[];
  loading: boolean;
  tokenCount: number;
  hideCard?: boolean;
  searchQuery: string;
  view: "all" | "assets" | "positions";
  showLowValueTokens: boolean;
  lowValueLoading: boolean;
  lowValueDisclosureRef: RefObject<HTMLDivElement>;
  onToggleLowValueTokens: () => void;
  onLowValueAnimationComplete: () => void;
}

export function HoldingsList({
  primaryAssetRows,
  lowValueAssetRows,
  lowValueTotalUsd,
  filteredDefiPositions,
  loading,
  tokenCount,
  hideCard,
  searchQuery,
  view,
  showLowValueTokens,
  lowValueLoading,
  lowValueDisclosureRef,
  onToggleLowValueTokens,
  onLowValueAnimationComplete,
  ...rowPresentation
}: HoldingsListProps) {
  const showAssets = view !== "positions";
  const showPositions = view !== "assets";
  const hasVisibleAssets =
    showAssets && (primaryAssetRows.length > 0 || lowValueAssetRows.length > 0);
  const hasVisiblePositions =
    showPositions && filteredDefiPositions.length > 0;
  const hasVisibleRows = hasVisibleAssets || hasVisiblePositions;

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

          {showAssets && lowValueAssetRows.length > 0 && (
            <LowValueAssetsSection
              rows={lowValueAssetRows}
              totalValueUsd={lowValueTotalUsd}
              isExpanded={showLowValueTokens}
              isLoading={lowValueLoading}
              hasVisiblePositions={hasVisiblePositions}
              disclosureRef={lowValueDisclosureRef}
              onToggle={onToggleLowValueTokens}
              onAnimationComplete={onLowValueAnimationComplete}
              {...rowPresentation}
            />
          )}

          {hasVisiblePositions && view === "all" && (
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

          {hasVisiblePositions &&
            filteredDefiPositions.map((position, index) => (
              <DefiPositionRow
                key={`defi-${position.protocol}-${position.name}-${index}`}
                position={position}
                hideValue={rowPresentation.hideValue}
                formatUsd={rowPresentation.formatUsd}
                resolveLogo={rowPresentation.resolveLogo}
              />
            ))}
        </>
      )}
    </ListSurface>
  );
}
