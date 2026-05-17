import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
  Box,
  HStack,
  Text,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  IconButton,
  Tooltip,
  Skeleton,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Input,
  InputGroup,
  InputLeftElement,
  Portal,
} from "@chakra-ui/react";
import { AddIcon, ChevronDownIcon, RepeatIcon, Search2Icon, ViewIcon, ViewOffIcon, WarningTwoIcon } from "@chakra-ui/icons";
import TxStatusList from "@/components/TxStatusList";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import AddTokenModal from "@/components/AddTokenModal";
import PortfolioChart from "@/components/PortfolioChart";
import ChainIcon from "@/components/ChainIcon";
import { useNetworks } from "@/contexts/NetworksContext";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { getVisibleChains } from "@/lib/chains";
import { Decorator, useTheme } from "@/theme";

const TokenHoldings = lazy(() => import("@/components/TokenHoldings"));

interface HoldingsState {
  totalValueUsd: number;
  loading: boolean;
  hideValue: boolean;
  toggleHideValue: () => void;
  refresh: () => void;
  tokenKeys: Set<string>;
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
}

/** Delay before refreshing balances after onchain tx confirmation (ms) */
const POST_CONFIRM_REFRESH_DELAY = 3000;

export default function PortfolioTabs({ address, activityTabTrigger = 0, holdingsTabTrigger = 0, refreshTrigger = 0, onTokenClick, onSwapClick, onRpcIssuesChange }: PortfolioTabsProps) {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = themeId === "midnight";
  // Selected tab uses an inverted contrast strip — Bauhaus paints it BLACK with
  // white text; Midnight uses a recessed dark surface with light text. There is
  // no single token pair that produces both effects, hence the conditional.
  const tabActiveBg = isDarkTheme ? "surface.sunken" : "fg.primary";
  const tabActiveFg = isDarkTheme ? "fg.primary" : "fg.inverse";
  // On (re)mount, default to whichever tab was most recently requested by the parent.
  // activityTabTrigger increments after a tx is initiated; holdingsTabTrigger
  // increments when the user backs out of send/swap without submitting.
  const [tabIndex, setTabIndex] = useState(activityTabTrigger > holdingsTabTrigger ? 1 : 0);
  const [holdingsState, setHoldingsState] = useState<HoldingsState | null>(null);
  const holdingsStateRef = useRef<HoldingsState | null>(null);
  holdingsStateRef.current = holdingsState;
  const addTokenModal = useDisclosure();
  const { networksInfo } = useNetworks();
  const visibleChains = getVisibleChains(networksInfo);
  const [filterChainId, setFilterChainId] = useState<number | null>(null);
  const selectedChain = filterChainId !== null ? visibleChains.find((c) => c.chainId === filterChainId) : null;
  const [chainSearch, setChainSearch] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [highlightedChainIndex, setHighlightedChainIndex] = useState(0);

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
      setTabIndex(1);
    }
  }, [activityTabTrigger]);

  // Switch to Holdings tab when holdingsTabTrigger increments (e.g. user backs
  // out of send/swap without submitting a tx).
  useEffect(() => {
    if (holdingsTabTrigger > 0) {
      setTabIndex(0);
    }
  }, [holdingsTabTrigger]);

  // Listen for tx confirmations from background and auto-refresh balances.
  // Debounce so rapid messages (e.g., batch tx with multiple calls) collapse into one refresh.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMessage = (message: { type: string }) => {
      if (message.type === "txHistoryUpdated") {
        // Clear any pending refresh and schedule a new one.
        // This ensures only one refresh fires even if multiple txHistoryUpdated
        // messages arrive in quick succession (e.g., non-atomic batch).
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          holdingsStateRef.current?.refresh();
        }, POST_CONFIRM_REFRESH_DELAY);
      }
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

  const formatUsd = (value: number): string =>
    formatUsdShared(value, { hide: holdingsState?.hideValue });

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.medium}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      position="relative"
      overflow="hidden"
    >
      {/* Corner decoration — Bauhaus only; Decorator renders nothing in Midnight */}
      <Decorator corner="top-right" accent="highlight" />

      <Tabs index={tabIndex} onChange={setTabIndex} variant="unstyled">
        {/* Tab bar */}
        <HStack
          borderBottom="2px solid"
          borderColor="border.default"
          spacing={0}
          justify="space-between"
        >
          <TabList flex={1}>
            <Tab
              px={3}
              py={2.5}
              fontSize="sm"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              borderRadius={0}
              color={tabIndex === 0 ? tabActiveFg : "text.secondary"}
              bg={tabIndex === 0 ? tabActiveBg : "transparent"}
              _hover={tabIndex === 0 ? {} : { bg: "bg.muted" }}
              _selected={{
                color: tabActiveFg,
                bg: tabActiveBg,
              }}
            >
              <HStack spacing={1.5}>
                <Text>Holdings</Text>
                {tabIndex === 0 && holdingsState && (
                  <>
                    {holdingsState.loading ? (
                      <Skeleton h="12px" w="50px" />
                    ) : (
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color={
                          isDarkTheme ? "status.success.fg" : "accent.highlight"
                        }
                      >
                        {formatUsd(holdingsState.totalValueUsd)}
                      </Text>
                    )}
                    <IconButton
                      aria-label={holdingsState.hideValue ? "Show values" : "Hide values"}
                      icon={holdingsState.hideValue ? <ViewOffIcon /> : <ViewIcon />}
                      size="xs"
                      variant="ghost"
                      color="whiteAlpha.600"
                      onClick={(e) => {
                        e.stopPropagation();
                        holdingsState.toggleHideValue();
                      }}
                      _hover={{ color: "accent.highlight" }}
                      minW="auto"
                      h="auto"
                      p={0}
                      fontSize="12px"
                    />
                  </>
                )}
              </HStack>
            </Tab>
            <Tab
              px={3}
              py={2.5}
              fontSize="sm"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              borderRadius={0}
              color={tabIndex === 1 ? tabActiveFg : "text.secondary"}
              bg={tabIndex === 1 ? tabActiveBg : "transparent"}
              _hover={tabIndex === 1 ? {} : { bg: "bg.muted" }}
              _selected={{
                color: tabActiveFg,
                bg: tabActiveBg,
              }}
            >
              Activity
            </Tab>
          </TabList>
        </HStack>

        {/* Filter bar - sits between tab bar and content */}
        <HStack
          px={2}
          py={1}
          justify="flex-end"
          align="center"
        >
          {/* Network filter dropdown */}
          <Menu
            isOpen={isChainMenuOpen}
            initialFocusRef={chainSearchInputRef}
            onOpen={() => {
              setIsChainMenuOpen(true);
              setHighlightedChainIndex(0);
            }}
            onClose={() => {
              setIsChainMenuOpen(false);
              setChainSearch("");
              setHighlightedChainIndex(0);
            }}
          >
            <MenuButton
              as={Box}
              cursor="pointer"
              px={2}
              h="24px"
              display="flex"
              alignItems="center"
              borderRadius="sm"
              border="1.5px solid"
              borderColor="border.subtle"
              bg="surface.raised"
              _hover={{ borderColor: "border.default" }}
              transition="border-color 0.15s"
            >
              <HStack spacing={1}>
                {selectedChain ? (
                  <>
                    <ChainIcon chainId={selectedChain.chainId} chainName={selectedChain.name} size="12px" withChip />
                    <Text fontSize="11px" fontWeight="600" color="text.secondary">{selectedChain.name}</Text>
                  </>
                ) : (
                  <Text fontSize="11px" fontWeight="600" color="text.secondary">All Networks</Text>
                )}
                <ChevronDownIcon boxSize="12px" color="text.tertiary" />
              </HStack>
            </MenuButton>
            <Portal>
            <MenuList
              bg="surface.raised"
              border="3px solid"
              borderColor="border.default"
              boxShadow="card"
              p={0}
              zIndex="popover"
              minW="180px"
            >
              <Box p={2} borderBottom="2px solid" borderColor="border.default">
                <InputGroup size="sm">
                  <InputLeftElement pointerEvents="none">
                    <Search2Icon color="text.tertiary" boxSize={3} />
                  </InputLeftElement>
                  <Input
                    ref={chainSearchInputRef}
                    value={chainSearch}
                    onChange={(e) => setChainSearch(e.target.value)}
                    placeholder="Filter by chain"
                    fontWeight="600"
                    fontSize="xs"
                    pl={9}
                    onKeyDown={(e) => {
                      // Total items = "All Networks" (when not searching) + filteredChains
                      const showAll = !chainSearch.trim();
                      const totalItems = (showAll ? 1 : 0) + filteredChains.length;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.stopPropagation();
                        setHighlightedChainIndex((prev) => Math.min(prev + 1, totalItems - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        e.stopPropagation();
                        setHighlightedChainIndex((prev) => Math.max(prev - 1, 0));
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (showAll && highlightedChainIndex === 0) {
                          setFilterChainId(null);
                        } else {
                          const chainIdx = showAll ? highlightedChainIndex - 1 : highlightedChainIndex;
                          const chain = filteredChains[chainIdx];
                          if (chain) setFilterChainId(chain.chainId);
                        }
                        setIsChainMenuOpen(false);
                        setChainSearch("");
                        return;
                      }
                      e.stopPropagation();
                    }}
                  />
                </InputGroup>
              </Box>
              <Box maxH="200px" overflowY="auto">
                {/* "All Networks" option - only when not searching */}
                {!chainSearch.trim() && (
                  <MenuItem
                    onClick={() => {
                      setFilterChainId(null);
                      setIsChainMenuOpen(false);
                      setChainSearch("");
                    }}
                    onMouseEnter={() => setHighlightedChainIndex(0)}
                    bg={highlightedChainIndex === 0 || filterChainId === null ? "bg.muted" : "transparent"}
                    _hover={{ bg: "bg.hover" }}
                    px={3}
                    py={2}
                  >
                    <Text fontWeight="700" fontSize="sm">All Networks</Text>
                  </MenuItem>
                )}
                {filteredChains.map((chain, index) => {
                  const itemIndex = chainSearch.trim() ? index : index + 1;
                  return (
                    <MenuItem
                      key={chain.chainId}
                      onClick={() => {
                        setFilterChainId(chain.chainId);
                        setIsChainMenuOpen(false);
                        setChainSearch("");
                      }}
                      onMouseEnter={() => setHighlightedChainIndex(itemIndex)}
                      bg={
                        itemIndex === highlightedChainIndex || chain.chainId === filterChainId
                          ? "bg.muted"
                          : "transparent"
                      }
                      _hover={{ bg: "bg.hover" }}
                      px={3}
                      py={2}
                    >
                      <HStack spacing={2}>
                        <ChainIcon chainId={chain.chainId} chainName={chain.name} size="18px" withChip />
                        <Text fontWeight="700" fontSize="sm">{chain.name}</Text>
                      </HStack>
                    </MenuItem>
                  );
                })}
                {filteredChains.length === 0 && (
                  <Box px={3} py={3}>
                    <Text fontSize="sm" fontWeight="700" color="text.secondary">
                      No networks match &ldquo;{chainSearch.trim()}&rdquo;
                    </Text>
                  </Box>
                )}
              </Box>
            </MenuList>
            </Portal>
          </Menu>

          {/* Action buttons (only on Holdings tab) */}
          {tabIndex === 0 && holdingsState && (
            <HStack spacing={1}>
              <Tooltip label="Add token" hasArrow>
                <IconButton
                  aria-label="Add token"
                  icon={<AddIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  onClick={addTokenModal.onOpen}
                  _hover={{ color: "accent.secondary" }}
                  minW="auto"
                />
              </Tooltip>
              <Tooltip label="Refresh" hasArrow>
                <IconButton
                  aria-label="Refresh portfolio"
                  icon={<RepeatIcon />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  onClick={holdingsState.refresh}
                  _hover={{ color: "accent.secondary" }}
                  minW="auto"
                  isDisabled={holdingsState.loading}
                />
              </Tooltip>
            </HStack>
          )}
        </HStack>

        <TabPanels>
          <TabPanel p={0}>
            <PortfolioChart
              address={address}
              hideValue={holdingsState?.hideValue}
              refreshTrigger={refreshTrigger}
            />
            {holdingsState?.apiUnavailable && (
              <HStack
                spacing={2.5}
                px={3}
                py={2}
                bg="status.warning.bg"
                borderTop="2px solid"
                borderBottom="2px solid"
                borderColor="border.default"
              >
                <WarningTwoIcon
                  color="status.warning.fg"
                  boxSize="14px"
                  flexShrink={0}
                />
                <Box flex={1} minW={0}>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    color="status.warning.fg"
                    lineHeight="1.25"
                    noOfLines={1}
                  >
                    Onchain balances loaded
                  </Text>
                  <Text
                    fontSize="2xs"
                    fontWeight="600"
                    color="status.warning.fg"
                    opacity={0.85}
                    lineHeight="1.25"
                    noOfLines={1}
                  >
                    Couldn’t reach the Portfolio service
                  </Text>
                </Box>
                <Tooltip label="Retry" hasArrow>
                  <IconButton
                    aria-label="Retry portfolio"
                    icon={<RepeatIcon />}
                    size="xs"
                    variant="ghost"
                    color="status.warning.fg"
                    onClick={() => holdingsState?.refresh()}
                    isDisabled={holdingsState?.loading}
                  />
                </Tooltip>
              </HStack>
            )}
            <Suspense fallback={<Skeleton h="100px" />}>
              <TokenHoldings
                key={`${address}:${refreshTrigger}`}
                address={address}
                onTokenClick={onTokenClick}
                onSwapClick={onSwapClick}
                onRpcIssuesChange={onRpcIssuesChange}
                hideHeader
                hideCard
                onStateChange={handleStateChange}
                filterChainId={filterChainId}
              />
            </Suspense>
          </TabPanel>
          <TabPanel p={0}>
            <Box px={2} pb={2}>
              <TxStatusList maxItems={10} address={address} hideHeader hideCard filterChainId={filterChainId} />
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <AddTokenModal
        isOpen={addTokenModal.isOpen}
        onClose={addTokenModal.onClose}
        onTokenAdded={() => holdingsState?.refresh()}
        existingTokenKeys={holdingsState?.tokenKeys ?? new Set()}
      />
    </Box>
  );
}
