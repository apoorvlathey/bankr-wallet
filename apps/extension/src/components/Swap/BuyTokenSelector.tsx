import { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Image,
  Wrap,
  WrapItem,
  Spinner,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import type { TokenListEntry } from "@/chrome/swapApi";
import type { PortfolioToken } from "@/chrome/portfolioApi";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Popular token symbols per chain, shown as quick-select chips */
const POPULAR_PER_CHAIN: Record<number, string[]> = {
  1: ["ETH", "USDC", "USDT", "WBTC", "WETH"],
  42161: ["ETH", "USDC", "USDT", "WETH"],
  8453: ["WCHAN", "ETH", "USDC", "USDT", "WBTC"],
  56: ["BNB", "USDC", "USDT", "WBTC", "WETH"],
  137: ["POL", "USDC", "WETH"],
  130: ["ETH", "USDC", "WBTC", "WETH"],
};

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return parseFloat(num.toPrecision(6)).toString();
}

function holdingToEntry(h: PortfolioToken): TokenListEntry {
  return {
    address:
      h.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS
        : h.contractAddress,
    name: h.name,
    symbol: h.symbol,
    decimals: h.decimals,
    logoURI: h.logoUrl || "",
  };
}

interface BuyTokenSelectorProps {
  tokenList: TokenListEntry[];
  holdings: PortfolioToken[];
  selectedToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  } | null;
  onTokenSelect: (token: TokenListEntry) => void;
  onAddressSubmit: (address: string) => void;
  excludeAddress?: string;
  chainId: number;
  /** Whether the parent is currently resolving a custom token address */
  buyTokenLoading?: boolean;
  /** Resolved token pending user confirmation */
  pendingToken?: TokenListEntry | null;
  /** Called when user clicks "Choose" on the pending token */
  onConfirmPending?: (token: TokenListEntry) => void;
}

export default function BuyTokenSelector({
  tokenList,
  holdings,
  selectedToken,
  onTokenSelect,
  onAddressSubmit,
  excludeAddress,
  chainId,
  buyTokenLoading,
  pendingToken,
  onConfirmPending,
}: BuyTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSubmittedRef = useRef("");

  const searchTerm = search.trim().toLowerCase();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setVisibleCount(60);
      lastSubmittedRef.current = "";
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setVisibleCount(60);
  }, [searchTerm]);

  const heldAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) {
      if (h.contractAddress === "native") {
        set.add(NATIVE_TOKEN_ADDRESS.toLowerCase());
      } else {
        set.add(h.contractAddress.toLowerCase());
      }
    }
    return set;
  }, [holdings]);

  const excludeLower = excludeAddress?.toLowerCase();

  const restTokens = useMemo(
    () =>
      tokenList
        .filter(
          (t) =>
            !heldAddresses.has(t.address.toLowerCase()) &&
            t.address.toLowerCase() !== excludeLower,
        )
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokenList, heldAddresses, excludeLower],
  );

  const filteredHoldings = useMemo(() => {
    const base = holdings.filter((h) => {
      const addr =
        h.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS.toLowerCase()
          : h.contractAddress.toLowerCase();
      return addr !== excludeLower;
    });
    if (!searchTerm) return base;
    return base.filter(
      (h) =>
        h.symbol.toLowerCase().includes(searchTerm) ||
        h.name.toLowerCase().includes(searchTerm) ||
        h.contractAddress.toLowerCase().includes(searchTerm),
    );
  }, [holdings, searchTerm, excludeLower]);

  const filteredRest = useMemo(() => {
    if (!searchTerm) return restTokens;
    return restTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(searchTerm) ||
        t.name.toLowerCase().includes(searchTerm) ||
        t.address.toLowerCase().includes(searchTerm),
    );
  }, [restTokens, searchTerm]);

  const visibleRest = filteredRest.slice(0, visibleCount);

  // Popular tokens: ordered per-chain list, matched against holdings + token list
  const popularTokens = useMemo(() => {
    if (searchTerm) return [];
    const symbols = POPULAR_PER_CHAIN[chainId];
    if (!symbols) return [];

    // Build lookup maps: symbol → entry (first match wins)
    const bySymbol = new Map<string, TokenListEntry>();
    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, holdingToEntry(h));
    }
    for (const t of tokenList) {
      const sym = t.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, t);
    }

    const result: TokenListEntry[] = [];
    for (const sym of symbols) {
      const entry = bySymbol.get(sym);
      if (entry && entry.address.toLowerCase() !== excludeLower) {
        result.push(entry);
      }
    }
    return result;
  }, [tokenList, holdings, excludeLower, searchTerm, chainId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      setVisibleCount((c) => Math.min(c + 60, filteredRest.length));
    }
  };

  const hasResults = filteredHoldings.length > 0 || filteredRest.length > 0;

  const handleSelect = (token: TokenListEntry) => {
    onTokenSelect(token);
    setIsOpen(false);
    setSearch("");
  };

  const handleHoldingSelect = (h: PortfolioToken) => {
    handleSelect(holdingToEntry(h));
  };

  // Auto-resolve when a valid address is typed/pasted
  useEffect(() => {
    const val = search.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(val) && val !== lastSubmittedRef.current) {
      lastSubmittedRef.current = val;
      onAddressSubmit(val);
    }
  }, [search]);

  const fallbackIcon =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect fill='%23ccc' width='20' height='20'/%3E%3C/svg%3E";

  const isSelectedAddr = (addr: string) =>
    selectedToken?.address.toLowerCase() === addr.toLowerCase();

  return (
    <Box ref={containerRef}>
      {/* Trigger */}
      <Box
        cursor="pointer"
        border="2px solid"
        borderColor="border.default"
        borderRadius="md"
        bg="surface.base"
        px={2}
        py={1.5}
        _hover={{ borderColor: "accent.secondary" }}
        display="flex"
        alignItems="center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <HStack spacing={2}>
          {selectedToken?.logoURI && (
            <Image
              src={selectedToken.logoURI}
              boxSize="20px"
              borderRadius="full"
              fallbackSrc={fallbackIcon}
            />
          )}
          <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
            {selectedToken?.symbol || "Select"}
          </Text>
          <ChevronDownIcon />
        </HStack>
      </Box>

      {/* Dropdown — positioned relative to the parent "You Buy" card. This
          panel mirrors a Menu surface but is hand-rolled (not <MenuList>),
          so we set its surface tokens explicitly. surface.sunken gives a
          recessed look against the You Receive card so the panel reads as
          a distinct layer in both themes. */}
      {isOpen && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          bg="surface.sunken"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="cardHover"
          zIndex={20}
          mt={-1}
        >
          {/* Search */}
          <Box p={2} borderBottom="2px solid" borderColor="border.default">
            <Input
              ref={inputRef}
              placeholder="Search or paste address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              fontSize="sm"
              border="2px solid"
              borderColor="border.default"
              bg="surface.raised"
              _focus={{ borderColor: "accent.secondary", boxShadow: "none" }}
              size="sm"
            />
          </Box>

          {/* Popular tokens chips */}
          {popularTokens.length > 0 && (
            <Box
              px={2}
              py={2}
              borderBottom="2px solid"
              borderColor="border.default"
            >
              <Wrap spacing={1.5}>
                {popularTokens.map((t) => (
                  <WrapItem key={t.address}>
                    <HStack
                      as="button"
                      spacing={1}
                      px={2}
                      py={1}
                      border="2px solid"
                      borderColor={
                        isSelectedAddr(t.address)
                          ? "accent.secondary"
                          : "border.default"
                      }
                      borderRadius="md"
                      bg={
                        isSelectedAddr(t.address)
                          ? "surface.raisedHover"
                          : "surface.raised"
                      }
                      _hover={{ borderColor: "accent.secondary" }}
                      onClick={() => handleSelect(t)}
                    >
                      <Image
                        src={t.logoURI}
                        boxSize="16px"
                        borderRadius="full"
                        fallbackSrc={fallbackIcon}
                      />
                      <Text
                        fontWeight="700"
                        fontSize="xs"
                        textTransform="uppercase"
                      >
                        {t.symbol}
                      </Text>
                    </HStack>
                  </WrapItem>
                ))}
              </Wrap>
            </Box>
          )}

          {/* Scrollable list */}
          <Box
            ref={scrollRef}
            maxH="220px"
            overflowY="auto"
            onScroll={handleScroll}
          >
            <VStack spacing={0} align="stretch">
              {/* Your Tokens */}
              {filteredHoldings.length > 0 && (
                <>
                  <Text
                    fontSize="2xs"
                    fontWeight="800"
                    color="text.tertiary"
                    textTransform="uppercase"
                    px={3}
                    pt={2}
                    pb={1}
                  >
                    Your Tokens
                  </Text>
                  {filteredHoldings.map((h) => (
                    <HStack
                      key={`held-${h.contractAddress}`}
                      px={3}
                      py={1.5}
                      cursor="pointer"
                      bg={
                        isSelectedAddr(
                          h.contractAddress === "native"
                            ? NATIVE_TOKEN_ADDRESS
                            : h.contractAddress,
                        )
                          ? "surface.sunken"
                          : "transparent"
                      }
                      _hover={{ bg: "surface.raisedHover" }}
                      onClick={() => handleHoldingSelect(h)}
                      spacing={2}
                    >
                      <Image
                        src={h.logoUrl}
                        boxSize="20px"
                        borderRadius="full"
                        fallbackSrc={fallbackIcon}
                      />
                      <Box flex={1} minW={0}>
                        <Text
                          fontWeight="700"
                          fontSize="sm"
                          textTransform="uppercase"
                          isTruncated
                          lineHeight="short"
                        >
                          {h.symbol}
                        </Text>
                        <Text
                          fontSize="2xs"
                          color="text.tertiary"
                          fontFamily="mono"
                          isTruncated
                          lineHeight="short"
                        >
                          {h.contractAddress === "native"
                            ? h.name
                            : truncateAddress(h.contractAddress)}
                        </Text>
                      </Box>
                      <Box textAlign="right" flexShrink={0}>
                        <Text
                          fontSize="xs"
                          fontWeight="600"
                          lineHeight="short"
                        >
                          {formatBalance(h.balance)}
                        </Text>
                        {h.valueUsd > 0 && (
                          <Text
                            fontSize="2xs"
                            color="text.tertiary"
                            lineHeight="short"
                          >
                            ${h.valueUsd.toFixed(2)}
                          </Text>
                        )}
                      </Box>
                    </HStack>
                  ))}
                  {visibleRest.length > 0 && (
                    <Box
                      borderBottom="2px solid"
                      borderColor="border.subtle"
                      mx={3}
                      my={1}
                    />
                  )}
                </>
              )}

              {/* All tokens */}
              {visibleRest.map((token) => (
                <HStack
                  key={token.address}
                  px={3}
                  py={1.5}
                  cursor="pointer"
                  bg={
                    isSelectedAddr(token.address)
                      ? "surface.sunken"
                      : "transparent"
                  }
                  _hover={{ bg: "surface.raisedHover" }}
                  onClick={() => handleSelect(token)}
                  spacing={2}
                >
                  <Image
                    src={token.logoURI}
                    boxSize="20px"
                    borderRadius="full"
                    fallbackSrc={fallbackIcon}
                  />
                  <Box flex={1} minW={0}>
                    <Text
                      fontWeight="700"
                      fontSize="sm"
                      textTransform="uppercase"
                      isTruncated
                      lineHeight="short"
                    >
                      {token.symbol}
                    </Text>
                    <Text
                      fontSize="2xs"
                      color="text.tertiary"
                      isTruncated
                      lineHeight="short"
                    >
                      {token.name}
                    </Text>
                  </Box>
                  <Text
                    fontSize="2xs"
                    color="text.tertiary"
                    fontFamily="mono"
                    flexShrink={0}
                  >
                    {truncateAddress(token.address)}
                  </Text>
                </HStack>
              ))}

              {/* Loading state for custom address resolution */}
              {buyTokenLoading && /^0x[a-fA-F0-9]{40}$/.test(search.trim()) && (
                <HStack px={3} py={3} spacing={2} justify="center">
                  <Spinner size="xs" color="accent.secondary" />
                  <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                    Loading token...
                  </Text>
                </HStack>
              )}

              {/* Resolved token from pasted address — uses warm highlight to
                  draw attention. User must click to select. */}
              {pendingToken && !buyTokenLoading && /^0x[a-fA-F0-9]{40}$/.test(search.trim()) && (
                <HStack
                  px={3}
                  py={2}
                  cursor="pointer"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  _hover={{ filter: "brightness(0.92)" }}
                  onClick={() => {
                    if (onConfirmPending) onConfirmPending(pendingToken);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  spacing={2}
                >
                  <Image
                    src={pendingToken.logoURI}
                    boxSize="20px"
                    borderRadius="full"
                    fallbackSrc={fallbackIcon}
                  />
                  <Box flex={1} minW={0}>
                    <Text fontWeight="700" fontSize="sm" textTransform="uppercase" isTruncated lineHeight="short">
                      {pendingToken.symbol}
                    </Text>
                    <Text fontSize="2xs" color="text.tertiary" fontFamily="mono" isTruncated lineHeight="short">
                      {truncateAddress(pendingToken.address)}
                    </Text>
                  </Box>
                  <Text fontSize="xs" color="text.secondary" fontWeight="700">
                    Choose
                  </Text>
                </HStack>
              )}

              {!hasResults && searchTerm && !buyTokenLoading && !pendingToken && (
                <Box px={3} py={3}>
                  <Text
                    fontSize="xs"
                    color="text.tertiary"
                    textAlign="center"
                  >
                    No tokens found
                  </Text>
                </Box>
              )}
            </VStack>
          </Box>
        </Box>
      )}
    </Box>
  );
}
