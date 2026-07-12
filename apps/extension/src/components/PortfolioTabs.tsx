import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import {
  Box,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Text,
  IconButton,
  Skeleton,
  useDisclosure,
  Button,
  VStack,
  type IconProps,
} from "@chakra-ui/react";
import { AddIcon, ChevronDownIcon, CloseIcon, RepeatIcon, SearchIcon, ViewIcon, ViewOffIcon, WarningTwoIcon } from "@chakra-ui/icons";
import TxStatusList from "@/components/TxStatusList";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import AddTokenModal from "@/components/AddTokenModal";
import PortfolioChart from "@/components/PortfolioChart";
import TokenHoldings from "@/components/TokenHoldings";
import ChainIcon from "@/components/ChainIcon";
import { useNetworks } from "@/contexts/NetworksContext";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { getVisibleChains } from "@/lib/chains";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ActionSheet,
  type ActionSheetChoice,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import NumberFlow, { type Format } from "@number-flow/react";

interface HoldingsState {
  totalValueUsd: number;
  loading: boolean;
  hideValue: boolean;
  toggleHideValue: () => void;
  refresh: (options?: { forceSnapshot?: boolean }) => Promise<void>;
  tokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
  apiUnavailable: boolean;
  chainTotals: ReadonlyMap<number, number>;
}

interface PortfolioTabsProps {
  address: string;
  /**
   * Chain selected by the active connected dapp, or null when there is no
   * connected dapp. Changes reset the portfolio filter; users can still
   * override the filter until the dapp context changes again.
   */
  connectedDappChainId?: number | null;
  activityTabTrigger?: number;
  holdingsTabTrigger?: number;
  refreshTrigger?: number;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  onTransactionClick?: (tx: CompletedTransaction) => void;
  quickActions?: ReactNode;
  onChainBalancesChange?: (
    totals: ReadonlyMap<number, number>,
    hidden: boolean,
  ) => void;
  onHideTokens?: () => void;
}

const PortfolioMenuIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </Icon>
);

/** Delay before refreshing balances after onchain tx confirmation (ms) */
const POST_CONFIRM_REFRESH_DELAY = 3000;

const PORTFOLIO_VALUE_FORMAT: Format = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const PORTFOLIO_VALUE_TIMING = {
  duration: 220,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
};

export default function PortfolioTabs({ address, connectedDappChainId = null, activityTabTrigger = 0, holdingsTabTrigger = 0, refreshTrigger = 0, onTokenClick, onSwapClick, onRpcIssuesChange, onTransactionClick, quickActions, onChainBalancesChange, onHideTokens }: PortfolioTabsProps) {
  // On (re)mount, default to whichever tab was most recently requested by the parent.
  // activityTabTrigger increments after a tx is initiated; holdingsTabTrigger
  // increments when the user backs out of send/swap without submitting.
  const [tabIndex, setTabIndex] = useState(activityTabTrigger > holdingsTabTrigger ? 2 : 0);
  const [holdingsState, setHoldingsState] = useState<HoldingsState | null>(null);
  const holdingsStateRef = useRef<HoldingsState | null>(null);
  holdingsStateRef.current = holdingsState;
  const [chartRefreshNonce, setChartRefreshNonce] = useState(0);
  const [hoveredChartValue, setHoveredChartValue] = useState<number | null>(null);
  const [balanceMotionDirection, setBalanceMotionDirection] = useState<
    "up" | "down" | null
  >(null);
  const displayedBalanceRef = useRef<number | null>(null);
  const balanceTintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTokenModal = useDisclosure();
  const portfolioActions = useDisclosure();
  const portfolioActionsButtonRef = useRef<HTMLButtonElement>(null);
  const { networksInfo } = useNetworks();
  const visibleChains = getVisibleChains(networksInfo);
  const [filterChainId, setFilterChainId] = useState<number | null>(
    connectedDappChainId,
  );
  const selectedChain = filterChainId !== null ? visibleChains.find((c) => c.chainId === filterChainId) : null;
  const [chainSearch, setChainSearch] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [isAssetSearchOpen, setIsAssetSearchOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const assetSearchInputRef = useRef<HTMLInputElement>(null);

  // The connected-dapp dock is authoritative only when its context changes.
  // A manual portfolio selection remains in place between those changes.
  useEffect(() => {
    setFilterChainId(connectedDappChainId);
  }, [connectedDappChainId]);

  // "All Networks" is index 0, chains start at index 1
  const filteredChains = useMemo(() => {
    const q = chainSearch.trim().toLowerCase();
    if (!q) return visibleChains;
    return visibleChains.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.chainId).includes(q),
    );
  }, [visibleChains, chainSearch]);

  // Switch to Activity tab when activityTabTrigger increments (after tx submission)
  useEffect(() => {
    if (activityTabTrigger > 0) {
      setTabIndex(2);
    }
  }, [activityTabTrigger]);

  useEffect(() => {
    if (!isChainMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChainMenuOpen(false);
        setChainSearch("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isChainMenuOpen]);

  // Switch to Holdings tab when holdingsTabTrigger increments (e.g. user backs
  // out of send/swap without submitting a tx).
  useEffect(() => {
    if (holdingsTabTrigger > 0) {
      setTabIndex(0);
    }
  }, [holdingsTabTrigger]);

  useEffect(() => {
    if (tabIndex === 0) return;
    setIsAssetSearchOpen(false);
    setAssetSearchQuery("");
  }, [tabIndex]);

  // Listen for balance-relevant tx updates from background and auto-refresh
  // balances. Bridge status polling also writes tx history every few seconds;
  // those updates only change `bridge` progress and should not fan out into
  // all-chain portfolio RPC refreshes.
  // Debounce so rapid messages (e.g., batch tx with multiple calls) collapse into one refresh.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMessage = (message: {
      type: string;
      changedKeys?: string[];
      updatedTx?: CompletedTransaction;
    }) => {
      if (message.type !== "txHistoryUpdated") return;
      const updated = message.updatedTx;
      if (
        updated &&
        updated.tx?.from?.toLowerCase?.() !== address.toLowerCase() &&
        updated.bridge?.receiverAddress?.toLowerCase?.() !==
          address.toLowerCase()
      ) {
        return;
      }
      const changedKeys = message.changedKeys;
      const hasAssetChanges = changedKeys?.some((key) =>
        ["assetChanges", "destAssetChanges"].includes(key),
      );
      if (hasAssetChanges) {
        // TokenHoldings owns this message: it immediately refreshes the exact
        // receipt tokens (including collapsed low-value rows). Do not let a
        // delayed generic load cancel that authoritative RPC pass.
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = null;
        return;
      }
      const shouldRefreshBalances =
        !changedKeys ||
        changedKeys.some((key) =>
          [
            "status",
            "txHash",
            "completedAt",
          ].includes(key),
        );
      if (!shouldRefreshBalances) return;

      // Clear any pending refresh and schedule a new one.
      // This ensures only one refresh fires even if multiple txHistoryUpdated
      // messages arrive in quick succession (e.g., non-atomic batch).
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        holdingsStateRef.current?.refresh();
      }, POST_CONFIRM_REFRESH_DELAY);
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [address]);

  const handleStateChange = useCallback((state: HoldingsState) => {
    setHoldingsState(state);
    onChainBalancesChange?.(state.chainTotals, state.hideValue);
  }, [onChainBalancesChange]);

  const handleSnapshotsChanged = useCallback(() => {
    setChartRefreshNonce((n) => n + 1);
  }, []);

  const portfolioDisplayValue =
    hoveredChartValue ?? holdingsState?.totalValueUsd ?? 0;
  const isBelowDisplayThreshold =
    portfolioDisplayValue > 0 && portfolioDisplayValue < 0.01;

  const handleChartHoverValueChange = useCallback((value: number | null) => {
    const nextValue = value ?? holdingsStateRef.current?.totalValueUsd ?? 0;
    const previousValue =
      displayedBalanceRef.current ?? holdingsStateRef.current?.totalValueUsd ?? 0;

    setHoveredChartValue(value);
    displayedBalanceRef.current = nextValue;

    if (nextValue === previousValue) return;
    setBalanceMotionDirection(nextValue > previousValue ? "up" : "down");
    if (balanceTintTimerRef.current) {
      clearTimeout(balanceTintTimerRef.current);
    }
    balanceTintTimerRef.current = setTimeout(() => {
      balanceTintTimerRef.current = null;
      setBalanceMotionDirection(null);
    }, PORTFOLIO_VALUE_TIMING.duration + 80);
  }, []);

  useEffect(
    () => () => {
      if (balanceTintTimerRef.current) {
        clearTimeout(balanceTintTimerRef.current);
      }
    },
    [],
  );

  const portfolioActionChoices: ActionSheetChoice[] = [
    {
      id: "refresh",
      label: "Refresh portfolio",
      description: "Fetch the latest balances and positions",
      icon: <RepeatIcon boxSize="18px" />,
      isDisabled: holdingsState?.loading,
    },
    {
      id: "add-token",
      label: "Add custom token",
      description: "Add a token using its contract address",
      icon: <AddIcon boxSize="16px" />,
    },
    ...(onHideTokens
      ? [{
          id: "hide-tokens",
          label: "Hide tokens",
          description: "Remove spam or unwanted tokens from your portfolio",
          icon: <ViewOffIcon boxSize="18px" />,
        }]
      : []),
  ];

  const handlePortfolioAction = (choiceId: string) => {
    if (choiceId === "refresh") void holdingsState?.refresh();
    else if (choiceId === "add-token") addTokenModal.onOpen();
    else if (choiceId === "hide-tokens") onHideTokens?.();
  };

  const portfolioControls = (
    <VStack align="stretch" spacing={2} mt={tabIndex === 0 ? 1 : 0} mb={2}>
      <HStack justify="space-between" align="center" minH="36px">
        <Button
          variant="ghost"
          size="sm"
          minH="36px"
          h="36px"
          px={2.5}
          color="fg.primary"
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ transform: "none", bg: "surface.raisedHover" }}
          leftIcon={
            selectedChain ? (
              <ChainIcon
                chainId={selectedChain.chainId}
                chainName={selectedChain.name}
                size="16px"
                withChip
              />
            ) : undefined
          }
          rightIcon={<ChevronDownIcon />}
          onClick={() => setIsChainMenuOpen(true)}
        >
          {selectedChain?.name ?? "All networks"}
        </Button>

        {tabIndex < 2 && holdingsState && (
          <HStack spacing={0} align="center">
            {tabIndex === 0 && !isAssetSearchOpen && (
              <IconButton
                aria-label="Search assets"
                icon={<SearchIcon boxSize="16px" />}
                size="sm"
                variant="ghost"
                color="fg.secondary"
                _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
                _active={{ color: "fg.primary", bg: "surface.sunken" }}
                onClick={() => {
                  setIsAssetSearchOpen(true);
                  window.requestAnimationFrame(() => assetSearchInputRef.current?.focus());
                }}
              />
            )}
            <IconButton
              ref={portfolioActionsButtonRef}
              aria-label="Open portfolio options"
              icon={<PortfolioMenuIcon boxSize="18px" />}
              size="sm"
              variant="ghost"
              color="fg.secondary"
              _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
              _active={{ color: "fg.primary", bg: "surface.sunken" }}
              onClick={portfolioActions.onOpen}
            />
          </HStack>
        )}
      </HStack>

      {tabIndex === 0 && isAssetSearchOpen && (
        <InputGroup size="md" h="44px">
          <InputLeftElement h="full" pointerEvents="none" color="fg.secondary">
            <SearchIcon boxSize="16px" />
          </InputLeftElement>
          <Input
            ref={assetSearchInputRef}
            aria-label="Search assets by token name or symbol"
            placeholder="Search token name or symbol"
            value={assetSearchQuery}
            h="full"
            pr="44px"
            onChange={(event) => setAssetSearchQuery(event.target.value)}
          />
          <InputRightElement h="full">
            <IconButton
              aria-label="Close asset search"
              icon={<CloseIcon boxSize="10px" />}
              size="sm"
              variant="ghost"
              color="fg.secondary"
              _hover={{ color: "fg.primary", bg: "transparent" }}
              _active={{ color: "fg.primary", bg: "transparent" }}
              onClick={() => {
                setAssetSearchQuery("");
                setIsAssetSearchOpen(false);
              }}
            />
          </InputRightElement>
        </InputGroup>
      )}

      {holdingsState?.apiUnavailable && tabIndex < 2 && (
        <HStack
          role="status"
          spacing={2.5}
          px={3}
          py={2.5}
          bg="status.warning.bg"
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
        >
          <WarningTwoIcon color="status.warning.fg" flexShrink={0} />
          <Box flex={1} minW={0}>
            <Text fontSize="sm" fontWeight="600" color="status.warning.fg">
              Onchain balances loaded
            </Text>
            <Text fontSize="xs" color="status.warning.fg">
              The portfolio service is unavailable. Some prices or positions may be missing.
            </Text>
          </Box>
          <IconButton
            aria-label="Retry portfolio"
            icon={<RepeatIcon />}
            size="sm"
            variant="ghost"
            color="status.warning.fg"
            onClick={() => holdingsState.refresh()}
            isDisabled={holdingsState.loading}
          />
        </HStack>
      )}
    </VStack>
  );

  return (
    <>
      <VStack align="stretch" spacing={2}>
        <Box px={1}>
          <Text fontSize="sm" color="fg.secondary" fontWeight="500">
            Portfolio balance
          </Text>
          <HStack mt={0.5} spacing={2} align="center">
            {!holdingsState ||
            (holdingsState.loading && !holdingsState.totalValueUsd) ? (
              <Skeleton h="34px" w="150px" />
            ) : (
              <Text
                data-testid="portfolio-balance"
                fontSize="3xl"
                lineHeight="1.15"
                fontWeight="700"
                letterSpacing="-0.03em"
                color={
                  balanceMotionDirection === "up"
                    ? "status.success.emphasis"
                    : balanceMotionDirection === "down"
                      ? "status.error.emphasis"
                      : "fg.primary"
                }
                transition="color 160ms cubic-bezier(0.23, 1, 0.32, 1)"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {holdingsState.hideValue ? (
                  formatUsdShared(portfolioDisplayValue, { hide: true })
                ) : (
                  <NumberFlow
                    value={isBelowDisplayThreshold ? 0.01 : portfolioDisplayValue}
                    locales="en-US"
                    format={PORTFOLIO_VALUE_FORMAT}
                    prefix={isBelowDisplayThreshold ? "<$" : "$"}
                    transformTiming={PORTFOLIO_VALUE_TIMING}
                    spinTiming={PORTFOLIO_VALUE_TIMING}
                    opacityTiming={{ duration: 120, easing: "ease-out" }}
                    willChange
                  />
                )}
              </Text>
            )}
            {holdingsState && (
              <IconButton
                aria-label={holdingsState.hideValue ? "Show portfolio values" : "Hide portfolio values"}
                icon={holdingsState.hideValue ? <ViewOffIcon /> : <ViewIcon />}
                variant="ghost"
                size="sm"
                color="fg.secondary"
                onClick={holdingsState.toggleHideValue}
              />
            )}
          </HStack>
        </Box>

        <PortfolioChart
          address={address}
          hideValue={holdingsState?.hideValue}
          refreshTrigger={refreshTrigger + chartRefreshNonce}
          onHoverValueChange={handleChartHoverValueChange}
        />

        {quickActions}

        <HStack
          role="tablist"
          aria-label="Portfolio sections"
          spacing={0}
          borderBottomWidth="1px"
          borderColor="border.subtle"
          px={1}
        >
          {["Assets", "Positions", "Activity"].map((label, index, labels) => (
            <Button
                key={label}
                id={`portfolio-tab-${index}`}
                role="tab"
                aria-selected={tabIndex === index}
                aria-controls={`portfolio-panel-${index}`}
                tabIndex={tabIndex === index ? 0 : -1}
                variant="ghost"
                flex={1}
                minH="44px"
                h="44px"
                px={2}
                py={2}
                fontSize="15px"
                fontWeight="600"
                color={tabIndex === index ? "fg.primary" : "fg.secondary"}
                bg="transparent"
                border="none"
                borderRadius={0}
                position="relative"
                _after={{
                  content: '""',
                  position: "absolute",
                  left: "50%",
                  bottom: "-1px",
                  w: tabIndex === index ? "28px" : 0,
                  h: "3px",
                  bg: "accent.highlight",
                  borderTopRadius: "full",
                  transform: "translateX(-50%)",
                  transition: "width 150ms cubic-bezier(0.2, 0.6, 0.2, 1)",
                }}
                _hover={{
                  color: "fg.primary",
                  bg: "surface.raisedHover",
                }}
                _active={{ transform: "none" }}
                onClick={() => setTabIndex(index)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % labels.length;
                  else if (event.key === "ArrowLeft") next = (index - 1 + labels.length) % labels.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = labels.length - 1;
                  else return;
                  event.preventDefault();
                  setTabIndex(next);
                  document.getElementById(`portfolio-tab-${next}`)?.focus();
                }}
              >
                {label}
            </Button>
          ))}
        </HStack>

        <Box
          id={`portfolio-panel-${tabIndex}`}
          role="tabpanel"
          aria-labelledby={`portfolio-tab-${tabIndex}`}
          tabIndex={0}
        >
          {portfolioControls}

          {/*
            TokenHoldings owns portfolio loading and the state displayed by the
            balance above. Keep that owner mounted on Activity as well; only
            hide its rows. This is especially important when returning from a
            transaction detail screen, where PortfolioTabs remounts directly
            onto Activity.
          */}
          <Box display={tabIndex < 2 ? "block" : "none"} aria-hidden={tabIndex >= 2}>
            <TokenHoldings
              key={`${address}:${refreshTrigger}`}
              address={address}
              view={tabIndex === 1 ? "positions" : "assets"}
              onTokenClick={onTokenClick}
              onSwapClick={onSwapClick}
              onRpcIssuesChange={onRpcIssuesChange}
              hideHeader
              hideCard
              onStateChange={handleStateChange}
              filterChainId={filterChainId}
              searchQuery={tabIndex === 0 ? assetSearchQuery : ""}
              onSnapshotsChanged={handleSnapshotsChanged}
            />
          </Box>

          {tabIndex === 2 && (
            <TxStatusList
              maxItems={10}
              address={address}
              hideHeader
              hideCard
              filterChainId={filterChainId}
              onSelectTx={onTransactionClick}
            />
          )}
        </Box>
      </VStack>

      <AddTokenModal
        isOpen={addTokenModal.isOpen}
        onClose={addTokenModal.onClose}
        onTokenAdded={async (options) => {
          await holdingsState?.refresh(options);
          handleSnapshotsChanged();
        }}
        existingTokenKeys={holdingsState?.tokenKeys ?? new Set()}
        allTokenKeys={holdingsState?.allTokenKeys ?? new Set()}
        hiddenTokenKeys={holdingsState?.hiddenTokenKeys ?? new Set()}
      />

      <ActionSheet
        isOpen={portfolioActions.isOpen}
        onClose={portfolioActions.onClose}
        title="Portfolio options"
        choices={portfolioActionChoices}
        onSelect={handlePortfolioAction}
        finalFocusRef={portfolioActionsButtonRef}
      />

      {isChainMenuOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            title="Filter by network"
            onBack={() => {
              setIsChainMenuOpen(false);
              setChainSearch("");
            }}
            controls={
              <FullScreenPickerSearch
                ref={chainSearchInputRef}
                label="Search networks"
                placeholder="Name or chain ID"
                value={chainSearch}
                onChange={(event) => setChainSearch(event.target.value)}
                autoFocus
              />
            }
          >
            <FullScreenPickerGroup label="Networks">
              {!chainSearch.trim() && (
                <ListItem
                  interactive
                  as="button"
                  isSelected={filterChainId === null}
                  onClick={() => {
                    setFilterChainId(null);
                    setIsChainMenuOpen(false);
                    setChainSearch("");
                  }}
                >
                  <ListItemContent>
                    <ListItemTitle>All networks</ListItemTitle>
                    <ListItemDescription>Show the complete portfolio</ListItemDescription>
                  </ListItemContent>
                </ListItem>
              )}
              {filteredChains.map((chain) => (
                <ListItem
                  interactive
                  key={chain.chainId}
                  as="button"
                  isSelected={filterChainId === chain.chainId}
                  onClick={() => {
                    setFilterChainId(chain.chainId);
                    setIsChainMenuOpen(false);
                    setChainSearch("");
                  }}
                >
                  <ListItemMedia>
                    <ChainIcon
                      chainId={chain.chainId}
                      chainName={chain.name}
                      size="24px"
                      withChip
                    />
                  </ListItemMedia>
                  <ListItemContent>
                    <ListItemTitle>{chain.name}</ListItemTitle>
                    <ListItemDescription>Chain ID {chain.chainId}</ListItemDescription>
                  </ListItemContent>
                </ListItem>
              ))}
            </FullScreenPickerGroup>
            {filteredChains.length === 0 && (
              <FullScreenPickerEmpty
                mt={4}
                title="No matching networks"
                description="Try another name or chain ID."
              />
            )}
          </FullScreenPicker>
        </FullScreenPickerLayer>
      )}
    </>
  );
}
