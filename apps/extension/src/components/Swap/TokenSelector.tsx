import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Input,
  Wrap,
  WrapItem,
  Spinner,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type { TokenListEntry } from "@/chrome/swapApi";
import { getChainConfig } from "@/constants/chainConfig";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { TokenSymbolFallback } from "@/components/Swap/TokenSymbolFallback";
import { truncateAddress } from "@/lib/addressUtils";
import { formatTokenBalance } from "@/lib/tokenFormatUtils";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Popular token symbols per chain — same list as BuyTokenSelector so the
 *  buy/sell dropdowns offer parity. */
const POPULAR_PER_CHAIN: Record<number, string[]> = {
  1: ["ETH", "USDC", "USDT", "WBTC", "WETH"],
  42161: ["ETH", "USDC", "USDT", "WETH"],
  8453: ["ETH", "USDC", "USDT", "WBTC"],
  56: ["BNB", "USDC", "USDT", "WBTC", "WETH"],
  137: ["POL", "USDC", "WETH"],
  130: ["ETH", "USDC", "WBTC", "WETH"],
};

function nativeLogoForChain(chainId: number, nativeSymbol: string): string {
  if (nativeSymbol.toUpperCase() === "ETH") return "/chainIcons/ethereum.svg";
  return getChainConfig(chainId)?.icon || "";
}

function getNativeCurrencyForChain(chainId: number) {
  return CHAIN_REGISTRY.find((c) => c.chainId === chainId)?.nativeCurrency;
}

/** Convert a static token-list entry into the PortfolioToken shape parents
 *  consume for the sell side. Tokens not in the user's holdings get a zero
 *  balance — the swap quote will still load against onchain balance. */
function entryToPortfolioToken(
  t: TokenListEntry,
  chainId: number,
): PortfolioToken {
  const isNative =
    t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  return {
    contractAddress: isNative ? "native" : t.address,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    balance: "0",
    balanceFormatted: "0",
    logoUrl: t.logoURI,
    valueUsd: 0,
    priceUsd: 0,
    chainId,
  };
}

interface TokenSelectorProps {
  holdings: PortfolioToken[];
  tokenList: TokenListEntry[];
  selectedToken: PortfolioToken | null;
  onSelect: (token: PortfolioToken) => void;
  excludeAddress?: string;
  chainId: number;
  /** Called when user enters a valid 0x address — parent resolves it */
  onCustomAddress?: (address: string) => void;
  /** Called when user clicks the resolved custom token row */
  onSelectCustomToken?: (token: PortfolioToken) => void;
  /** Resolved custom token to show in dropdown */
  resolvedCustomToken?: PortfolioToken | null;
  /** Whether custom token is currently being resolved */
  customTokenLoading?: boolean;
  /** Error message from custom token resolution */
  customTokenError?: string | null;
  /** Chain name shown in empty state */
  chainName?: string;
  /** Which edge of the trigger the dropdown anchors to. Defaults to "left"
   *  (swap UI). Send UI passes "right" so the dropdown opens leftward into
   *  the available popup space. */
  dropdownAlign?: "left" | "right";
}

export default function TokenSelector({
  holdings,
  tokenList,
  selectedToken,
  onSelect,
  excludeAddress,
  chainId,
  onCustomAddress,
  onSelectCustomToken,
  resolvedCustomToken,
  customTokenLoading,
  customTokenError,
  chainName,
  dropdownAlign = "left",
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSubmittedRef = useRef("");

  const searchTerm = search.trim().toLowerCase();
  const excludeLower = excludeAddress?.toLowerCase();

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

  // Fixed-positioned dropdown: anchor to the trigger, but flip horizontally
  // when the popup viewport is narrower than the dropdown placed at the
  // trigger's left edge. Keeps Swap (trigger on the left) anchored left and
  // Send (trigger on the right) anchored right — both fitting the popup.
  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownPos(null);
      return;
    }
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const padding = 8;
      const viewportW = document.documentElement.clientWidth;
      const desiredW = 280;
      const width = Math.min(desiredW, viewportW - padding * 2);
      let left: number;
      if (dropdownAlign === "right") {
        // Pin to the popup viewport's right edge so the dropdown sits in the
        // empty right-of-trigger space (used by the Send page where the
        // trigger lives in a narrow left-side column).
        left = viewportW - padding - width;
      } else {
        // Anchor to trigger's left edge; flip if it would overflow right.
        left = rect.left;
        if (left + width > viewportW - padding) left = rect.right - width;
      }
      if (left < padding) left = padding;
      setDropdownPos({ top: rect.bottom, left, width });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isOpen, dropdownAlign]);

  useEffect(() => {
    setVisibleCount(60);
  }, [searchTerm]);

  // Auto-resolve when a valid address is typed/pasted
  useEffect(() => {
    const val = search.trim();
    if (
      /^0x[a-fA-F0-9]{40}$/.test(val) &&
      onCustomAddress &&
      val !== lastSubmittedRef.current
    ) {
      lastSubmittedRef.current = val;
      onCustomAddress(val);
    }
  }, [search, onCustomAddress]);

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

  // Popular tokens: ordered per-chain list, matched against holdings + token
  // list, with native token pinned to our canonical icon.
  const popularTokens = useMemo(() => {
    if (searchTerm) return [];
    const symbols = POPULAR_PER_CHAIN[chainId];
    if (!symbols) return [];

    const bySymbol = new Map<string, PortfolioToken>();
    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, h);
    }
    for (const t of tokenList) {
      const sym = t.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, entryToPortfolioToken(t, chainId));
    }

    // Native token: ensure presence + override its logo with our local asset
    // (portfolio-API native logos can come back wrong/missing on L2s).
    const native = getNativeCurrencyForChain(chainId);
    if (native) {
      const nativeSym = native.symbol.toUpperCase();
      const canonicalLogo = nativeLogoForChain(chainId, native.symbol);
      const existing = bySymbol.get(nativeSym);
      bySymbol.set(nativeSym, {
        contractAddress: existing?.contractAddress ?? "native",
        name: existing?.name ?? native.name,
        symbol: existing?.symbol ?? native.symbol,
        decimals: existing?.decimals ?? native.decimals,
        balance: existing?.balance ?? "0",
        balanceFormatted: existing?.balanceFormatted ?? "0",
        logoUrl: canonicalLogo,
        valueUsd: existing?.valueUsd ?? 0,
        priceUsd: existing?.priceUsd ?? 0,
        chainId: existing?.chainId ?? chainId,
      });
    }

    const result: PortfolioToken[] = [];
    for (const sym of symbols) {
      const entry = bySymbol.get(sym);
      if (!entry) continue;
      const addr =
        entry.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS
          : entry.contractAddress;
      if (addr.toLowerCase() === excludeLower) continue;
      result.push(entry);
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

  const handleSelectHolding = (h: PortfolioToken) => {
    onSelect(h);
    setIsOpen(false);
    setSearch("");
  };

  const handleSelectListEntry = (t: TokenListEntry) => {
    onSelect(entryToPortfolioToken(t, chainId));
    setIsOpen(false);
    setSearch("");
  };

  const handleSelectPortfolio = (p: PortfolioToken) => {
    onSelect(p);
    setIsOpen(false);
    setSearch("");
  };

  const isSelectedAddr = (addr: string) => {
    if (!selectedToken) return false;
    const selAddr =
      selectedToken.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS
        : selectedToken.contractAddress;
    return selAddr.toLowerCase() === addr.toLowerCase();
  };

  const hasResults =
    filteredHoldings.length > 0 || filteredRest.length > 0;
  const isAddressSearch = /^0x[a-fA-F0-9]{40}$/.test(search.trim());

  return (
    <Box ref={containerRef} position="relative">
      {/* Trigger */}
      <Box
        ref={triggerRef}
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
          {selectedToken &&
            (selectedToken.logoUrl ? (
              <Image
                src={selectedToken.logoUrl}
                alt={selectedToken.symbol}
                boxSize="20px"
                borderRadius="full"
                fallback={
                  <TokenSymbolFallback
                    symbol={selectedToken.symbol}
                    size="20px"
                  />
                }
              />
            ) : (
              <TokenSymbolFallback
                symbol={selectedToken.symbol}
                size="20px"
              />
            ))}
          <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
            {selectedToken?.symbol || "Select"}
          </Text>
          <ChevronDownIcon />
        </HStack>
      </Box>

      {/* Dropdown */}
      {isOpen && dropdownPos && (
        <Box
          position="fixed"
          top={`${dropdownPos.top - 4}px`}
          left={`${dropdownPos.left}px`}
          w={`${dropdownPos.width}px`}
          bg="surface.sunken"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="cardHover"
          zIndex={20}
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
                {popularTokens.map((t) => {
                  const addr =
                    t.contractAddress === "native"
                      ? NATIVE_TOKEN_ADDRESS
                      : t.contractAddress;
                  return (
                    <WrapItem key={addr}>
                      <HStack
                        as="button"
                        spacing={1}
                        px={2}
                        py={1}
                        border="2px solid"
                        borderColor={
                          isSelectedAddr(addr)
                            ? "accent.secondary"
                            : "border.default"
                        }
                        borderRadius="md"
                        bg={
                          isSelectedAddr(addr)
                            ? "surface.raisedHover"
                            : "surface.raised"
                        }
                        _hover={{ borderColor: "accent.secondary" }}
                        onClick={() => handleSelectPortfolio(t)}
                      >
                        {t.logoUrl ? (
                          <Image
                            src={t.logoUrl}
                            alt={t.symbol}
                            boxSize="16px"
                            borderRadius="full"
                            fallback={
                              <TokenSymbolFallback
                                symbol={t.symbol}
                                size="16px"
                              />
                            }
                          />
                        ) : (
                          <TokenSymbolFallback
                            symbol={t.symbol}
                            size="16px"
                          />
                        )}
                        <Text
                          fontWeight="700"
                          fontSize="xs"
                          textTransform="uppercase"
                        >
                          {t.symbol}
                        </Text>
                      </HStack>
                    </WrapItem>
                  );
                })}
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
              {/* Loading state for custom address resolution */}
              {customTokenLoading && isAddressSearch && (
                <HStack px={3} py={3} spacing={2} justify="center">
                  <Spinner size="xs" color="accent.secondary" />
                  <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                    Loading token...
                  </Text>
                </HStack>
              )}

              {/* Error state for custom token */}
              {customTokenError && !customTokenLoading && isAddressSearch && (
                <Box px={3} py={2}>
                  <Text fontSize="xs" fontWeight="700" color="chart.negative">
                    {customTokenError}
                  </Text>
                </Box>
              )}

              {/* Resolved custom token — warm highlight to draw the eye. */}
              {resolvedCustomToken &&
                !customTokenLoading &&
                onSelectCustomToken &&
                isAddressSearch && (
                  <HStack
                    px={3}
                    py={2}
                    cursor="pointer"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    _hover={{ filter: "brightness(0.85)" }}
                    onClick={() => {
                      onSelectCustomToken(resolvedCustomToken);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    spacing={2}
                  >
                    {resolvedCustomToken.logoUrl ? (
                      <Image
                        src={resolvedCustomToken.logoUrl}
                        alt={resolvedCustomToken.symbol}
                        boxSize="20px"
                        borderRadius="full"
                        fallback={
                          <TokenSymbolFallback
                            symbol={resolvedCustomToken.symbol}
                            size="20px"
                          />
                        }
                      />
                    ) : (
                      <TokenSymbolFallback
                        symbol={resolvedCustomToken.symbol}
                        size="20px"
                      />
                    )}
                    <Box flex={1} minW={0}>
                      <Text
                        fontWeight="700"
                        fontSize="sm"
                        textTransform="uppercase"
                        isTruncated
                        lineHeight="short"
                      >
                        {resolvedCustomToken.symbol}
                      </Text>
                      <Text
                        fontSize="2xs"
                        color="accentFg.highlight"
                        opacity={0.75}
                        fontFamily="mono"
                        isTruncated
                        lineHeight="short"
                      >
                        {formatTokenBalance(resolvedCustomToken.balance)}
                      </Text>
                    </Box>
                    <Text
                      fontSize="xs"
                      color="accentFg.highlight"
                      fontWeight="700"
                    >
                      Choose
                    </Text>
                  </HStack>
                )}

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
                  {filteredHoldings.map((h) => {
                    const addr =
                      h.contractAddress === "native"
                        ? NATIVE_TOKEN_ADDRESS
                        : h.contractAddress;
                    return (
                      <HStack
                        key={`held-${h.contractAddress}`}
                        px={3}
                        py={1.5}
                        cursor="pointer"
                        bg={
                          isSelectedAddr(addr)
                            ? "surface.sunken"
                            : "transparent"
                        }
                        _hover={{ bg: "surface.raisedHover" }}
                        onClick={() => handleSelectHolding(h)}
                        spacing={2}
                      >
                        {h.logoUrl ? (
                          <Image
                            src={h.logoUrl}
                            alt={h.symbol}
                            boxSize="20px"
                            borderRadius="full"
                            fallback={
                              <TokenSymbolFallback
                                symbol={h.symbol}
                                size="20px"
                              />
                            }
                          />
                        ) : (
                          <TokenSymbolFallback
                            symbol={h.symbol}
                            size="20px"
                          />
                        )}
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
                            {formatTokenBalance(h.balance)}
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
                    );
                  })}
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

              {/* All tokens (from token list, minus holdings) */}
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
                  onClick={() => handleSelectListEntry(token)}
                  spacing={2}
                >
                  {token.logoURI ? (
                    <Image
                      src={token.logoURI}
                      alt={token.symbol}
                      boxSize="20px"
                      borderRadius="full"
                      fallback={
                        <TokenSymbolFallback
                          symbol={token.symbol}
                          size="20px"
                        />
                      }
                    />
                  ) : (
                    <TokenSymbolFallback
                      symbol={token.symbol}
                      size="20px"
                    />
                  )}
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

              {/* Empty state */}
              {!hasResults &&
                !customTokenLoading &&
                !resolvedCustomToken &&
                !customTokenError && (
                  <Box px={3} py={4}>
                    <Text
                      fontSize="sm"
                      color="text.tertiary"
                      textAlign="center"
                    >
                      {searchTerm
                        ? "No tokens found"
                        : `No tokens${chainName ? ` on ${chainName}` : ""}`}
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
