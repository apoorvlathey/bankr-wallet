import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Skeleton,
  Text,
  Tooltip,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
} from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { getVisibleChains } from "@/lib/chains";
import { HoldingsList } from "./HoldingsList";
import { HoldingsModals } from "./HoldingsModals";
import type { LoadPortfolioOptions, TokenHoldingsProps } from "./types";
import { useHoldingsLifecycle } from "./useHoldingsLifecycle";
import { useHoldingsState } from "./useHoldingsState";
import { useHoldingsViewModel } from "./useHoldingsViewModel";
import { useLowValueBalanceRefresh } from "./useLowValueBalanceRefresh";
import { usePortfolioLoader } from "./usePortfolioLoader";
import { useTokenManagement } from "./useTokenManagement";

function TokenHoldings({
  address,
  onTokenClick,
  onSwapClick,
  hideHeader,
  hideCard,
  onRpcIssuesChange,
  filterChainId,
  onShowAllNetworks,
  searchQuery = "",
  onSnapshotsChanged,
  onStateChange,
  unifyBalances = true,
  view = "all",
}: TokenHoldingsProps) {
  const { networksInfo } = useNetworks();
  const prefersReducedMotion = usePrefersReducedMotion();
  const chainReloadKey = useMemo(
    () =>
      getVisibleChains(networksInfo)
        .map(
          (chain) =>
            `${chain.chainId}:${chain.name}:${chain.rpcUrl}:${chain.nativeCurrency.symbol}:${chain.hidden}`,
        )
        .sort()
        .join("|"),
    [networksInfo],
  );
  const [showLowValueTokens, setShowLowValueTokens] = useState(false);
  const lowValueDisclosureRef = useRef<HTMLDivElement | null>(null);
  const state = useHoldingsState({
    address,
    chainReloadKey,
  });
  const loadPortfolio = usePortfolioLoader({
    address,
    chainReloadKey,
    showLowValueTokens,
    state,
    onRpcIssuesChange,
    onSnapshotsChanged,
  });
  useHoldingsLifecycle({ address, chainReloadKey, loadPortfolio, state });
  const viewModel = useHoldingsViewModel({
    filterChainId,
    searchQuery,
    showLowValueTokens,
    unifyBalances,
    state,
  });
  useLowValueBalanceRefresh({
    address,
    chainReloadKey,
    lowValueTokens: viewModel.lowValueTokens,
    showLowValueTokens,
    state,
    onRpcIssuesChange,
    onSnapshotsChanged,
  });
  const management = useTokenManagement({ loadPortfolio, state });

  const scrollLowValueDisclosureIntoView = useCallback(() => {
    if (!showLowValueTokens) return;
    lowValueDisclosureRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [prefersReducedMotion, showLowValueTokens]);

  const toggleHideValueRef = useRef(state.toggleHideValue);
  toggleHideValueRef.current = state.toggleHideValue;
  const loadPortfolioRef = useRef(loadPortfolio);
  loadPortfolioRef.current = loadPortfolio;

  useEffect(() => {
    onStateChange?.({
      totalValueUsd: state.totalValueUsd,
      loading: state.loading,
      hideValue: state.hideValue,
      toggleHideValue: () => toggleHideValueRef.current(),
      refresh: (options?: LoadPortfolioOptions) =>
        loadPortfolioRef.current(true, options),
      tokenKeys: viewModel.tokenKeys,
      allTokenKeys: state.allTokenKeys,
      hiddenTokenKeys: state.hiddenTokenKeys,
      apiUnavailable: state.apiUnavailable,
      chainTotals: viewModel.chainTotals,
    });
  }, [
    state.totalValueUsd,
    state.loading,
    state.hideValue,
    onStateChange,
    viewModel.tokenKeys,
    state.allTokenKeys,
    state.hiddenTokenKeys,
    state.apiUnavailable,
    viewModel.chainTotals,
  ]);

  const formatUsd = (value: number): string =>
    formatUsdShared(value, { hide: state.hideValue });

  if (state.error && state.tokens.length === 0) {
    return (
      <EmptyState minH="144px">
        <EmptyStateHeader>
          <EmptyStateTitle>Portfolio unavailable</EmptyStateTitle>
          <EmptyStateDescription>
            WalletChan could not load your balances. Your wallet is still safe.
          </EmptyStateDescription>
        </EmptyStateHeader>
        <EmptyStateActions>
          <Button
            leftIcon={<RepeatIcon />}
            variant="secondary"
            onClick={() => loadPortfolio(true)}
          >
            Try again
          </Button>
        </EmptyStateActions>
      </EmptyState>
    );
  }

  const tokenList = (
    <HoldingsList
      primaryAssetRows={viewModel.primaryAssetRows}
      lowValueAssetRows={viewModel.lowValueAssetRows}
      lowValueTotalUsd={viewModel.lowValueTotalUsd}
      filteredDefiPositions={viewModel.filteredDefiPositions}
      loading={state.loading}
      tokenCount={state.tokens.length}
      hideCard={hideCard}
      hasNetworkFilter={filterChainId != null}
      onShowAllNetworks={onShowAllNetworks}
      searchQuery={searchQuery}
      view={view}
      showLowValueTokens={showLowValueTokens}
      lowValueLoading={state.lowValueLoading}
      lowValueDisclosureRef={lowValueDisclosureRef}
      onToggleLowValueTokens={() =>
        setShowLowValueTokens((expanded) => !expanded)
      }
      onLowValueAnimationComplete={scrollLowValueDisclosureIntoView}
      customTokenKeys={state.customTokenKeys}
      networksInfo={networksInfo ?? {}}
      onTokenClick={onTokenClick}
      onSwapClick={onSwapClick}
      onEditToken={management.openEditTokenModal}
      onHideToken={management.openHideTokenModal}
      resolveLogo={viewModel.resolveLogo}
      hideValue={state.hideValue}
      formatUsd={formatUsd}
    />
  );
  const modals = (
    <HoldingsModals loadPortfolio={loadPortfolio} management={management} />
  );

  if (hideCard) {
    return (
      <>
        {tokenList}
        {modals}
      </>
    );
  }

  return (
    <Box position="relative">
      {!hideHeader && (
        <HStack px={1} pb={3} justify="space-between">
          <HStack spacing={2}>
            <Text fontSize="md" fontWeight={600} color="fg.primary">
              {view === "positions" ? "Positions" : "Assets"}
            </Text>
            {state.loading && <Skeleton h="14px" w="60px" />}
            {!state.loading && (
              <Text
                fontSize="sm"
                fontWeight={500}
                color="fg.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatUsd(state.totalValueUsd)}
              </Text>
            )}
          </HStack>
          <HStack spacing={1}>
            <Tooltip
              label={state.hideValue ? "Show values" : "Hide values"}
              hasArrow
            >
              <IconButton
                aria-label={state.hideValue ? "Show values" : "Hide values"}
                icon={state.hideValue ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                color="fg.secondary"
                onClick={state.toggleHideValue}
              />
            </Tooltip>
            <Tooltip label="Refresh" hasArrow>
              <IconButton
                aria-label="Refresh portfolio"
                icon={<RepeatIcon />}
                size="sm"
                variant="ghost"
                color="fg.secondary"
                onClick={() => loadPortfolio(true)}
                isDisabled={state.loading}
              />
            </Tooltip>
          </HStack>
        </HStack>
      )}
      {tokenList}
      {modals}
    </Box>
  );
}

export default memo(TokenHoldings);
