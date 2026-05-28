import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import { AddIcon, ChevronDownIcon, Search2Icon } from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import AccountSwitcher from "@/components/AccountSwitcher";
import ChainIcon from "@/components/ChainIcon";
import { useIconChipBg } from "@/theme";
import type { ResolvedChain } from "@/lib/chains";

interface AccountNetworkControlsProps {
  accounts: Account[];
  activeAccount: Account | null;
  selectedChain: ResolvedChain | undefined;
  visibleChains: ResolvedChain[];
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onChainSelect: (chainName: string) => void;
  onAddChain: () => void;
}

function AccountNetworkControls({
  accounts,
  activeAccount,
  selectedChain,
  visibleChains,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
  onChainSelect,
  onAddChain,
}: AccountNetworkControlsProps) {
  const iconChipBg = useIconChipBg();
  const [chainSearch, setChainSearch] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [highlightedChainIndex, setHighlightedChainIndex] = useState(0);
  const selectedChainItemRef = useRef<HTMLElement | null>(null);
  const chainScrollRef = useRef<HTMLDivElement | null>(null);
  const lastChainAutoScrollTopRef = useRef<number | null>(null);
  const userScrolledChainMenuRef = useRef(false);
  const normalizedChainSearch = chainSearch.trim().toLowerCase();
  const filteredVisibleChains = normalizedChainSearch
    ? visibleChains.filter(
        (chain) =>
          chain.name.toLowerCase().includes(normalizedChainSearch) ||
          String(chain.chainId).includes(normalizedChainSearch),
      )
    : visibleChains;

  useEffect(() => {
    setHighlightedChainIndex(0);
  }, [chainSearch, isChainMenuOpen]);

  const scrollSelectedChainIntoView = useCallback(() => {
    const node = selectedChainItemRef.current;
    const parent = chainScrollRef.current;
    if (!node || !parent || parent.clientHeight === 0) return;
    if (userScrolledChainMenuRef.current) return;

    if (
      lastChainAutoScrollTopRef.current !== null &&
      Math.abs(parent.scrollTop - lastChainAutoScrollTopRef.current) > 1
    ) {
      return;
    }

    const parentRect = parent.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (parentRect.height === 0 || nodeRect.height === 0) return;

    const relativeTop = nodeRect.top - parentRect.top + parent.scrollTop;
    const maxScrollTop = Math.max(0, parent.scrollHeight - parent.clientHeight);
    const target = Math.min(
      maxScrollTop,
      Math.max(0, relativeTop - (parent.clientHeight - node.offsetHeight) / 2),
    );

    parent.scrollTop = target;
    lastChainAutoScrollTopRef.current = parent.scrollTop;
  }, []);

  useLayoutEffect(() => {
    if (!isChainMenuOpen || normalizedChainSearch) {
      lastChainAutoScrollTopRef.current = null;
      userScrolledChainMenuRef.current = false;
      return;
    }

    let cancelled = false;
    const rafIds: number[] = [];
    const timeoutIds: number[] = [];
    const run = () => {
      if (!cancelled) scrollSelectedChainIntoView();
    };
    const queueFrame = (remaining: number) => {
      const raf = requestAnimationFrame(() => {
        run();
        if (remaining > 1) queueFrame(remaining - 1);
      });
      rafIds.push(raf);
    };

    queueFrame(3);
    timeoutIds.push(window.setTimeout(run, 80));
    timeoutIds.push(window.setTimeout(run, 220));

    return () => {
      cancelled = true;
      rafIds.forEach(cancelAnimationFrame);
      timeoutIds.forEach(clearTimeout);
    };
  }, [
    filteredVisibleChains.length,
    isChainMenuOpen,
    normalizedChainSearch,
    scrollSelectedChainIntoView,
    selectedChain?.chainId,
  ]);

  const selectChain = (chainName: string) => {
    onChainSelect(chainName);
    setIsChainMenuOpen(false);
    setChainSearch("");
  };

  return (
    <HStack spacing={3} align="stretch">
      {accounts.length > 0 && (
        <Box flex={1} minW={0}>
          <AccountSwitcher
            accounts={accounts}
            activeAccount={activeAccount}
            onAccountSelect={onAccountSelect}
            onAddAccount={onAddAccount}
            onAccountSettings={onAccountSettings}
          />
        </Box>
      )}

      <Box
        alignSelf="stretch"
        display="flex"
        flexShrink={1}
        minW="136px"
        maxW="40%"
      >
        <Menu
          isLazy
          isOpen={isChainMenuOpen}
          lazyBehavior="unmount"
          initialFocusRef={chainSearchInputRef}
          onOpen={() => {
            lastChainAutoScrollTopRef.current = null;
            userScrolledChainMenuRef.current = false;
            setIsChainMenuOpen(true);
            setHighlightedChainIndex(0);
          }}
          onClose={() => {
            lastChainAutoScrollTopRef.current = null;
            userScrolledChainMenuRef.current = false;
            setIsChainMenuOpen(false);
            setChainSearch("");
            setHighlightedChainIndex(0);
          }}
        >
          <MenuButton
            as={Button}
            variant="ghost"
            bg="surface.raised"
            border="3px solid"
            borderColor="border.default"
            boxShadow="card"
            _hover={{
              transform: "translateY(-2px)",
              boxShadow: "cardHover",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
            fontWeight="700"
            w="full"
            h="auto"
            minH="full"
            py={3}
            px={3}
            transition="all 0.2s ease-out"
            overflow="hidden"
            position="relative"
          >
            <ChevronDownIcon
              position="absolute"
              bottom="8px"
              right="4px"
              boxSize="14px"
              color="text.secondary"
            />
            {selectedChain ? (
              <HStack spacing={1.5} minW={0} align="center" pr={3}>
                <ChainIcon
                  chainId={selectedChain.chainId}
                  chainName={selectedChain.name}
                  size="18px"
                  flexShrink={0}
                  withChip
                />
                <Text
                  fontSize="2xs"
                  fontWeight="700"
                  whiteSpace="normal"
                  lineHeight="1.2"
                  textAlign="left"
                >
                  {selectedChain.name}
                </Text>
              </HStack>
            ) : (
              <Text color="text.tertiary" fontSize="sm">
                Net
              </Text>
            )}
          </MenuButton>
          <MenuList
            bg="surface.raised"
            border="3px solid"
            borderColor="border.default"
            boxShadow="card"
            py={0}
            minW="160px"
            maxH="320px"
            overflow="hidden"
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
                placeholder="Search chains"
                fontWeight="600"
                pl={9}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (filteredVisibleChains.length > 0) {
                      setHighlightedChainIndex((prev) =>
                        Math.min(prev + 1, filteredVisibleChains.length - 1),
                      );
                    }
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (filteredVisibleChains.length > 0) {
                      setHighlightedChainIndex((prev) => Math.max(prev - 1, 0));
                    }
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    const highlighted = filteredVisibleChains[highlightedChainIndex];
                    if (highlighted) {
                      selectChain(highlighted.name);
                    }
                    return;
                  }
                  e.stopPropagation();
                }}
              />
            </InputGroup>
          </Box>
          <Box
            ref={chainScrollRef}
            maxH={activeAccount?.type !== "bankr" ? "219px" : "268px"}
            overflowY="auto"
            onScroll={(event) => {
              const { scrollTop } = event.currentTarget;
              if (lastChainAutoScrollTopRef.current === null) {
                if (scrollTop > 0) userScrolledChainMenuRef.current = true;
                return;
              }
              if (Math.abs(scrollTop - lastChainAutoScrollTopRef.current) > 1) {
                userScrolledChainMenuRef.current = true;
              }
            }}
          >
            {filteredVisibleChains.map((chain, i, currentChains) => (
              <MenuItem
                key={chain.chainId}
                ref={
                  chain.chainId === selectedChain?.chainId
                    ? (node: HTMLElement | null) => {
                        selectedChainItemRef.current = node;
                      }
                    : undefined
                }
                bg={
                  i === highlightedChainIndex ||
                  chain.chainId === selectedChain?.chainId
                    ? "surface.raisedHover"
                    : "surface.raised"
                }
                _hover={{ bg: "surface.raisedHover" }}
                borderBottom={i < currentChains.length - 1 ? "2px solid" : "none"}
                borderColor="border.default"
                py={3}
                onMouseEnter={() => setHighlightedChainIndex(i)}
                onClick={() => selectChain(chain.name)}
              >
                <HStack spacing={2}>
                  <Box
                    bg={iconChipBg}
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="md"
                    p={0.5}
                  >
                    <ChainIcon chainId={chain.chainId} chainName={chain.name} size="18px" />
                  </Box>
                  <Text color="text.primary" fontWeight="700">
                    {chain.name}
                  </Text>
                </HStack>
              </MenuItem>
            ))}
            {filteredVisibleChains.length === 0 && (
              <Box px={3} py={3}>
                <Text fontSize="sm" fontWeight="700" color="text.secondary">
                  No chains match "{chainSearch.trim()}".
                </Text>
              </Box>
            )}
          </Box>
          {activeAccount?.type !== "bankr" && (
            <>
              <MenuDivider borderColor="border.default" m={0} />
              <MenuItem
                bg="surface.raised"
                _hover={{ bg: "surface.raisedHover" }}
                py={3}
                onClick={onAddChain}
              >
                <HStack spacing={2}>
                  <Box
                    bg="border.default"
                    p={0.5}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <AddIcon color="white" boxSize="14px" p="2px" />
                  </Box>
                  <Text color="text.secondary" fontWeight="700" fontSize="sm">
                    Add Chain
                  </Text>
                </HStack>
              </MenuItem>
            </>
          )}
          </MenuList>
        </Menu>
      </Box>
    </HStack>
  );
}

export default memo(AccountNetworkControls);
