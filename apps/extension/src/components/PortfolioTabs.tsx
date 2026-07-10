import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import {
  Box,
  HStack,
  Text,
  IconButton,
  Tooltip,
  Skeleton,
  useDisclosure,
  Button,
  VStack,
} from "@chakra-ui/react";
import { AddIcon, ChevronDownIcon, RepeatIcon, ViewIcon, ViewOffIcon, WarningTwoIcon } from "@chakra-ui/icons";
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
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";

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
}

interface PortfolioTabsProps {
  address: string;
  activityTabTrigger?: number;
  holdingsTabTrigger?: number;
  refreshTrigger?: number;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  onTransactionClick?: (tx: CompletedTransaction) => void;
  quickActions?: ReactNode;
}

/** Delay before refreshing balances after onchain tx confirmation (ms) */
const POST_CONFIRM_REFRESH_DELAY = 3000;

export default function PortfolioTabs({ address, activityTabTrigger = 0, holdingsTabTrigger = 0, refreshTrigger = 0, onTokenClick, onSwapClick, onRpcIssuesChange, onTransactionClick, quickActions }: PortfolioTabsProps) {
  // On (re)mount, default to whichever tab was most recently requested by the parent.
  // activityTabTrigger increments after a tx is initiated; holdingsTabTrigger
  // increments when the user backs out of send/swap without submitting.
  const [tabIndex, setTabIndex] = useState(activityTabTrigger > holdingsTabTrigger ? 2 : 0);
  const [holdingsState, setHoldingsState] = useState<HoldingsState | null>(null);
  const holdingsStateRef = useRef<HoldingsState | null>(null);
  holdingsStateRef.current = holdingsState;
  const [chartRefreshNonce, setChartRefreshNonce] = useState(0);
  const addTokenModal = useDisclosure();
  const { networksInfo } = useNetworks();
  const visibleChains = getVisibleChains(networksInfo);
  const [filterChainId, setFilterChainId] = useState<number | null>(null);
  const selectedChain = filterChainId !== null ? visibleChains.find((c) => c.chainId === filterChainId) : null;
  const [chainSearch, setChainSearch] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);

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
    }) => {
      if (message.type !== "txHistoryUpdated") return;
      const changedKeys = message.changedKeys;
      const shouldRefreshBalances =
        !changedKeys ||
        changedKeys.some((key) =>
          [
            "status",
            "txHash",
            "completedAt",
            "assetChanges",
            "destAssetChanges",
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
  }, []);

  const handleStateChange = useCallback((state: HoldingsState) => {
    setHoldingsState(state);
  }, []);

  const handleSnapshotsChanged = useCallback(() => {
    setChartRefreshNonce((n) => n + 1);
  }, []);

  const formatUsd = (value: number): string =>
    formatUsdShared(value, { hide: holdingsState?.hideValue });

  return (
    <>
      <VStack align="stretch" spacing={4}>
        <Box px={1}>
          <Text fontSize="sm" color="fg.secondary" fontWeight="500">
            Portfolio balance
          </Text>
          <HStack mt={0.5} spacing={2} align="center">
            {holdingsState?.loading && !holdingsState.totalValueUsd ? (
              <Skeleton h="34px" w="150px" />
            ) : (
              <Text
                fontSize="3xl"
                lineHeight="1.15"
                fontWeight="700"
                letterSpacing="-0.03em"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatUsd(holdingsState?.totalValueUsd ?? 0)}
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

        {quickActions}

        <HStack
          role="tablist"
          aria-label="Portfolio sections"
          spacing={0}
          borderBottomWidth="1px"
          borderColor="border.subtle"
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
                fontSize="sm"
                fontWeight="600"
                color={tabIndex === index ? "fg.primary" : "fg.secondary"}
                borderBottomWidth="2px"
                borderColor={tabIndex === index ? "accent.primary" : "transparent"}
                borderRadius={0}
                mb="-1px"
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

        <HStack justify="space-between" minH="36px">
          <Button
            variant="ghost"
            size="sm"
            h="36px"
            px={2}
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
            <HStack spacing={1}>
              {tabIndex === 0 && (
                <Tooltip label="Add token" hasArrow>
                  <IconButton
                    aria-label="Add token"
                    icon={<AddIcon boxSize="12px" />}
                    size="sm"
                    variant="ghost"
                    onClick={addTokenModal.onOpen}
                  />
                </Tooltip>
              )}
              <Tooltip label="Refresh portfolio" hasArrow>
                <IconButton
                  aria-label="Refresh portfolio"
                  icon={<RepeatIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => holdingsState.refresh()}
                  isDisabled={holdingsState.loading}
                />
              </Tooltip>
            </HStack>
          )}
        </HStack>

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

        <Box
          id={`portfolio-panel-${tabIndex}`}
          role="tabpanel"
          aria-labelledby={`portfolio-tab-${tabIndex}`}
          tabIndex={0}
        >
          {tabIndex === 0 && (
            <PortfolioChart
              address={address}
              hideValue={holdingsState?.hideValue}
              refreshTrigger={refreshTrigger + chartRefreshNonce}
            />
          )}

          {tabIndex < 2 && (
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
              onSnapshotsChanged={handleSnapshotsChanged}
            />
          )}

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
