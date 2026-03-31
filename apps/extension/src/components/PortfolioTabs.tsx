import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
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
} from "@chakra-ui/react";
import { AddIcon, RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import TxStatusList from "@/components/TxStatusList";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import AddTokenModal from "@/components/AddTokenModal";

const TokenHoldings = lazy(() => import("@/components/TokenHoldings"));

interface HoldingsState {
  totalValueUsd: number;
  loading: boolean;
  hideValue: boolean;
  toggleHideValue: () => void;
  refresh: () => void;
  tokenKeys: Set<string>;
}

interface PortfolioTabsProps {
  address: string;
  activityTabTrigger?: number;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
}

/** Delay before refreshing balances after on-chain tx confirmation (ms) */
const POST_CONFIRM_REFRESH_DELAY = 3000;

export default function PortfolioTabs({ address, activityTabTrigger = 0, onTokenClick, onSwapClick }: PortfolioTabsProps) {
  const [tabIndex, setTabIndex] = useState(activityTabTrigger > 0 ? 1 : 0);
  const [holdingsState, setHoldingsState] = useState<HoldingsState | null>(null);
  const holdingsStateRef = useRef<HoldingsState | null>(null);
  holdingsStateRef.current = holdingsState;
  const addTokenModal = useDisclosure();

  // Switch to Activity tab when activityTabTrigger increments (after tx submission)
  useEffect(() => {
    if (activityTabTrigger > 0) {
      setTabIndex(1);
    }
  }, [activityTabTrigger]);

  // Listen for tx confirmations from background and auto-refresh balances
  useEffect(() => {
    const handleMessage = (message: { type: string }) => {
      if (message.type === "txHistoryUpdated") {
        // Tx status changed (likely confirmed on-chain) — refresh after a delay
        // so RPC nodes have time to reflect the new state
        setTimeout(() => {
          holdingsStateRef.current?.refresh();
        }, POST_CONFIRM_REFRESH_DELAY);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleStateChange = useCallback((state: HoldingsState) => {
    setHoldingsState(state);
  }, []);

  const formatUsd = (value: number): string => {
    if (holdingsState?.hideValue) return "****";
    if (value === 0) return "$0.00";
    if (value < 0.01) return "<$0.01";
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Box
      bg="bauhaus.white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      position="relative"
    >
      {/* Corner decoration */}
      <Box
        position="absolute"
        top="-3px"
        right="-3px"
        w="10px"
        h="10px"
        bg="bauhaus.yellow"
        border="2px solid"
        borderColor="bauhaus.black"
        zIndex={1}
      />

      <Tabs index={tabIndex} onChange={setTabIndex} variant="unstyled">
        {/* Tab bar */}
        <HStack
          borderBottom="2px solid"
          borderColor="bauhaus.black"
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
              color={tabIndex === 0 ? "bauhaus.white" : "text.secondary"}
              bg={tabIndex === 0 ? "bauhaus.black" : "transparent"}
              _hover={tabIndex === 0 ? {} : { bg: "bg.muted" }}
              _selected={{
                color: "bauhaus.white",
                bg: "bauhaus.black",
              }}
            >
              <HStack spacing={1.5}>
                <Text>Holdings</Text>
                {tabIndex === 0 && holdingsState && (
                  <>
                    {holdingsState.loading ? (
                      <Skeleton h="12px" w="50px" />
                    ) : (
                      <Text fontSize="xs" fontWeight="900" color="bauhaus.yellow">
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
                      _hover={{ color: "bauhaus.yellow" }}
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
              color={tabIndex === 1 ? "bauhaus.white" : "text.secondary"}
              bg={tabIndex === 1 ? "bauhaus.black" : "transparent"}
              _hover={tabIndex === 1 ? {} : { bg: "bg.muted" }}
              _selected={{
                color: "bauhaus.white",
                bg: "bauhaus.black",
              }}
            >
              Activity
            </Tab>
          </TabList>

          {/* Action buttons - only visible on Holdings tab */}
          {tabIndex === 0 && holdingsState && (
            <HStack spacing={1} pr={2}>
              <Tooltip label="Add token" hasArrow>
                <IconButton
                  aria-label="Add token"
                  icon={<AddIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  onClick={addTokenModal.onOpen}
                  _hover={{ color: "bauhaus.blue" }}
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
                  _hover={{ color: "bauhaus.blue" }}
                  minW="auto"
                  isDisabled={holdingsState.loading}
                />
              </Tooltip>
            </HStack>
          )}
        </HStack>

        <TabPanels>
          <TabPanel p={0}>
            <Suspense fallback={<Skeleton h="100px" />}>
              <TokenHoldings
                address={address}
                onTokenClick={onTokenClick}
                onSwapClick={onSwapClick}
                hideHeader
                hideCard
                onStateChange={handleStateChange}
              />
            </Suspense>
          </TabPanel>
          <TabPanel p={0}>
            <Box p={2}>
              <TxStatusList maxItems={10} address={address} hideHeader hideCard />
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
