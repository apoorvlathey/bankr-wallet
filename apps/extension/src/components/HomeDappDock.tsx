import { useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Container,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  VStack,
  useDisclosure,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import ChainIcon from "@/components/ChainIcon";
import type { ResolvedChain } from "@/lib/chains";
import { useTheme } from "@/theme";
import { formatUsd } from "@/lib/currencyFormatUtils";
import DappSiteIcon from "@/components/DappSiteIcon";
import { useSheetTransitionSound } from "@/sounds/useSheetTransitionSound";

export interface ActiveDappConnectionContext {
  tabId: number;
  origin: string | null;
  hostname: string;
  title?: string;
  favicon?: string | null;
  connected: boolean;
}

interface HomeDappDockProps {
  context: ActiveDappConnectionContext | null;
  selectedChain: ResolvedChain | undefined;
  visibleChains: ResolvedChain[];
  chainBalances: ReadonlyMap<number, number>;
  hideBalances: boolean;
  onChainSelect: (chainName: string) => void;
  onDisconnect: (origin: string) => Promise<void>;
}

function SiteMark({ context }: { context: ActiveDappConnectionContext | null }) {
  const label = context?.hostname || "No active site";
  return <DappSiteIcon src={context?.favicon} label={label} />;
}

// Lucide `wallet-minimal`, ISC licensed: https://lucide.dev/icons/wallet-minimal
function WalletBalanceIcon() {
  return (
    <Icon
      viewBox="0 0 24 24"
      boxSize="12px"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 14h.01" />
      <path d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14" />
    </Icon>
  );
}

export default function HomeDappDock({
  context,
  selectedChain,
  visibleChains,
  chainBalances,
  hideBalances,
  onChainSelect,
  onDisconnect,
}: HomeDappDockProps) {
  const sheet = useDisclosure();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { tokens } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isDisconnectHovered, setIsDisconnectHovered] = useState(false);
  const [chainSearch, setChainSearch] = useState("");
  useSheetTransitionSound(sheet.isOpen);

  const rankedChains = useMemo(() => {
    const query = chainSearch.trim().toLowerCase();
    const chains = visibleChains
      .filter(
        (chain) =>
          !query ||
          chain.name.toLowerCase().includes(query) ||
          chain.nativeCurrency.symbol.toLowerCase().includes(query),
      )
      .map((chain) => ({
        chain,
        balanceUsd: chainBalances.get(chain.chainId) ?? 0,
      }));

    chains.sort((a, b) => {
      const aFunded = a.balanceUsd > 0;
      const bFunded = b.balanceUsd > 0;
      if (aFunded !== bFunded) return aFunded ? -1 : 1;
      if (aFunded && bFunded && a.balanceUsd !== b.balanceUsd) {
        return b.balanceUsd - a.balanceUsd;
      }
      return a.chain.name.localeCompare(b.chain.name);
    });
    return chains;
  }, [chainBalances, chainSearch, visibleChains]);

  const closeSheet = () => {
    setChainSearch("");
    sheet.onClose();
  };

  const chooseChain = (chainName: string) => {
    onChainSelect(chainName);
    closeSheet();
  };

  const disconnect = async () => {
    if (!context?.origin) return;
    setIsDisconnecting(true);
    try {
      await onDisconnect(context.origin);
      closeSheet();
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      <Box
        px={3}
        pt={2}
        pb="calc(8px + env(safe-area-inset-bottom, 0px))"
        bg="surface.base"
        borderTop="1px solid"
        borderColor="border.subtle"
      >
        <HStack
          w="full"
          minH="54px"
          spacing={0}
          bg="surface.raised"
          borderRadius="lg"
          overflow="hidden"
        >
          <HStack minW={0} flex={1} spacing={3} px={3} py={2}>
            <SiteMark context={context} />
            <VStack minW={0} flex={1} align="stretch" spacing={0} textAlign="start">
              <Text color="fg.primary" fontSize="sm" fontWeight="600" noOfLines={1}>
                {context?.hostname || "No active site"}
              </Text>
              {context?.connected ? (
                <Button
                  variant="ghost"
                  size="xs"
                  w="96px"
                  h="28px"
                  minW={0}
                  px={2}
                  ml={-2}
                  my={-1}
                  borderRadius="md"
                  justifyContent="flex-start"
                  color={isDisconnectHovered ? "chart.negative" : "fg.secondary"}
                  aria-label={`Disconnect ${context.hostname}`}
                  isLoading={isDisconnecting}
                  spinnerPlacement="start"
                  onMouseEnter={() => setIsDisconnectHovered(true)}
                  onMouseLeave={() => setIsDisconnectHovered(false)}
                  onFocus={() => setIsDisconnectHovered(true)}
                  onBlur={() => setIsDisconnectHovered(false)}
                  onClick={() => void disconnect()}
                >
                  <HStack spacing={1.5}>
                    <Box
                      boxSize="6px"
                      borderRadius="full"
                      bg={
                        isDisconnectHovered
                          ? "chart.negative"
                          : "status.success.fg"
                      }
                    />
                    <Text fontSize="xs" fontWeight="500">
                      {isDisconnectHovered ? "Disconnect?" : "Connected"}
                    </Text>
                  </HStack>
                </Button>
              ) : (
                <HStack spacing={1.5}>
                  <Box boxSize="6px" borderRadius="full" bg="fg.muted" />
                  <Text color="fg.secondary" fontSize="xs" fontWeight="500">
                    Not connected
                  </Text>
                </HStack>
              )}
            </VStack>
          </HStack>

          {context?.connected && selectedChain && <Button
            ref={triggerRef}
            variant="ghost"
            flex="0 1 auto"
            w="auto"
            maxW="52%"
            minW={0}
            alignSelf="stretch"
            h="auto"
            minH="54px"
            px={3}
            borderRadius={0}
            _hover={{ bg: "surface.raisedHover" }}
            _active={{ bg: "surface.sunken" }}
            aria-label={`Switch network, currently ${selectedChain.name}`}
            onClick={sheet.onOpen}
          >
            <HStack minW={0} spacing={2}>
              <HStack
                minW={0}
                spacing={1.5}
              >
                <ChainIcon
                  chainId={selectedChain.chainId}
                  chainName={selectedChain.name}
                  size="16px"
                  withChip
                />
                <Text color="fg.secondary" fontSize="xs" fontWeight="600" noOfLines={1}>
                  {selectedChain.name}
                </Text>
              </HStack>
              <ChevronDownIcon boxSize={5} color="fg.muted" flexShrink={0} />
            </HStack>
          </Button>}
        </HStack>
      </Box>

      <Drawer
        isOpen={sheet.isOpen}
        placement="bottom"
        onClose={closeSheet}
        finalFocusRef={triggerRef}
        returnFocusOnClose
        trapFocus
      >
        <DrawerOverlay />
        <DrawerContent
          w="full"
          h="75dvh"
          maxH="640px"
          bg="transparent"
          boxShadow="none"
          pointerEvents="none"
          motionProps={
            reducedMotion
              ? {
                  variants: {
                    enter: { opacity: 1, y: 0, transition: { duration: 0.1 } },
                    exit: { opacity: 0, y: 0, transition: { duration: 0.08 } },
                  },
                }
              : undefined
          }
        >
          <Box
            position="relative"
            w="full"
            maxW="prose"
            h="full"
            mx="auto"
            bg="surface.raised"
            borderTop={tokens.borders.thin}
            borderColor="border.default"
            borderTopRadius={tokens.radii.modal}
            overflow="hidden"
            pointerEvents="auto"
          >
          <Box
            aria-hidden="true"
            position="absolute"
            top={2}
            left="50%"
            transform="translateX(-50%)"
            w="36px"
            h="4px"
            borderRadius="full"
            bg="border.strong"
          />
          <Container
            px={0}
            h="full"
            minH={0}
            position="relative"
            display="flex"
            flexDirection="column"
          >
            <DrawerCloseButton top={4} right={3} boxSize="40px" />
            <DrawerHeader px={4} pt={7} pb={3} pr={14}>
              <HStack spacing={3}>
                <SiteMark context={context} />
                <VStack minW={0} align="stretch" spacing={0}>
                  <Text as="h2" color="fg.primary" fontSize="lg" lineHeight="1.3" noOfLines={1}>
                    {context?.hostname || "No active site"}
                  </Text>
                  <Text color="fg.secondary" fontSize="sm" noOfLines={1}>
                    {context?.connected ? "Connected to WalletChan" : "Not connected"}
                  </Text>
                </VStack>
              </HStack>
            </DrawerHeader>

            <DrawerBody px={4} py={2} overflowY="auto" overscrollBehavior="contain">
              {context?.connected ? (
                <VStack align="stretch" spacing={4}>
                  <Box>
                  <Text color="fg.secondary" fontSize="xs" fontWeight="700" mb={2}>
                    NETWORK FOR THIS SITE
                  </Text>
                  <InputGroup mb={3}>
                    <InputLeftElement pointerEvents="none">
                      <SearchIcon color="fg.muted" boxSize={4} />
                    </InputLeftElement>
                    <Input
                      aria-label="Search networks"
                      placeholder="Search networks"
                      value={chainSearch}
                      onChange={(event) => setChainSearch(event.target.value)}
                    />
                  </InputGroup>
                  <VStack
                    align="stretch"
                    spacing={0}
                    bg="surface.raised"
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius="lg"
                    overflow="hidden"
                  >
                    {rankedChains.map(({ chain, balanceUsd }, index) => {
                      const isSelected = chain.chainId === selectedChain?.chainId;
                      return (
                        <Button
                          key={chain.chainId}
                          variant="ghost"
                          w="full"
                          h="auto"
                          minH="52px"
                          px={3}
                          py={2.5}
                          borderRadius={0}
                          borderBottomWidth={index < rankedChains.length - 1 ? "1px" : 0}
                          borderColor="border.subtle"
                          justifyContent="flex-start"
                          onClick={() => chooseChain(chain.name)}
                        >
                          <HStack w="full" minW={0} spacing={3}>
                            <ChainIcon
                              chainId={chain.chainId}
                              chainName={chain.name}
                              size="24px"
                              withChip
                            />
                            <VStack minW={0} flex={1} align="stretch" spacing={0} textAlign="start">
                              <Text color="fg.primary" fontSize="sm" fontWeight="600" noOfLines={1}>
                                {chain.name}
                              </Text>
                              {balanceUsd > 0 && (
                                <HStack spacing={1.5} color="fg.secondary">
                                  <WalletBalanceIcon />
                                  <Text fontSize="xs">
                                    {formatUsd(balanceUsd, { hide: hideBalances })}
                                  </Text>
                                </HStack>
                              )}
                            </VStack>
                            {isSelected ? (
                              <CheckIcon boxSize={3.5} color="accent.highlight" />
                            ) : (
                              <ChevronRightIcon boxSize={5} color="fg.muted" />
                            )}
                          </HStack>
                        </Button>
                      );
                    })}
                    {rankedChains.length === 0 && (
                      <Box px={4} py={6} textAlign="center">
                        <Text color="fg.secondary" fontSize="sm">
                          No networks match “{chainSearch.trim()}”
                        </Text>
                      </Box>
                    )}
                  </VStack>
                  </Box>
                </VStack>
              ) : (
                <Box
                  bg="surface.raised"
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  px={4}
                  py={5}
                >
                  <Text color="fg.primary" fontSize="sm" fontWeight="600" mb={1}>
                    This site is not connected
                  </Text>
                  <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
                    When the site asks to connect, WalletChan will show a confirmation
                    before sharing your wallet address.
                  </Text>
                </Box>
              )}
            </DrawerBody>
          </Container>
          </Box>
        </DrawerContent>
      </Drawer>
    </>
  );
}
