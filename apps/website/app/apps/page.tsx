"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Button,
  Flex,
  Image,
  Skeleton,
  SkeletonCircle,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
} from "@chakra-ui/react";
import { Search, ChevronDown, Globe } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navigation } from "../components/Navigation";
import { TokenBanner } from "../components/TokenBanner";
import { AppCard } from "./components/AppCard";
import { IframeApp } from "./components/IframeApp";
import { DAPPS, CHAIN_NAMES, CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, getChainColor, getChainTextColor } from "./data/dapps";
import type { DappEntry } from "./data/dapps";
import { ChainIcon } from "./components/ChainIcon";

export default function AppsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Restore dapp from ?url= param synchronously to avoid grid flash
  const [activeDapp, setActiveDapp] = useState<DappEntry | null>(() => {
    const urlParam = searchParams.get("url");
    if (!urlParam) return null;
    return (
      DAPPS.find((d) => d.url === urlParam) ||
      DAPPS.filter((d) => urlParam.startsWith(d.url))
        .sort((a, b) => b.url.length - a.url.length)[0] ||
      null
    );
  });
  const [customUrl, setCustomUrl] = useState<string | null>(() => {
    const urlParam = searchParams.get("url");
    if (!urlParam) return null;
    // Only set customUrl if no known dapp matched
    const matched = DAPPS.some(
      (d) => d.url === urlParam || urlParam.startsWith(d.url)
    );
    return matched ? null : urlParam;
  });
  const [customUrlName, setCustomUrlName] = useState<string | null>(null);
  const [initialChainId] = useState<number | undefined>(() => {
    const chainParam = searchParams.get("chainId");
    return chainParam ? Number(chainParam) : undefined;
  });

  /** Check if search input looks like a URL */
  const isUrl = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Match URLs with protocol or common domain patterns
    return /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed);
  }, []);

  /** Normalize a URL string — prepend https:// if missing */
  const normalizeUrl = useCallback((text: string) => {
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }, []);

  // Derive unique chain IDs from the dapps data
  const availableChains = useMemo(() => {
    const chainSet = new Set<number>();
    DAPPS.forEach((dapp) => dapp.chains.forEach((c) => chainSet.add(c)));
    // Ethereum first, then alphabetical by name
    return Array.from(chainSet).sort((a, b) => {
      if (a === 1) return -1;
      if (b === 1) return 1;
      const nameA = (CHAIN_NAMES[a] || `Chain ${a}`).toLowerCase();
      const nameB = (CHAIN_NAMES[b] || `Chain ${b}`).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, []);

  // Count dapps per chain for the filter
  const chainCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    DAPPS.forEach((dapp) =>
      dapp.chains.forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      })
    );
    return counts;
  }, []);

  const filteredDapps = useMemo(() => {
    return DAPPS.filter((dapp) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        dapp.name.toLowerCase().includes(q) ||
        dapp.description.toLowerCase().includes(q) ||
        dapp.url.toLowerCase().includes(q);
      const matchesChain =
        !selectedChain || dapp.chains.includes(selectedChain);
      const matchesCategory =
        !selectedCategory || (dapp.categories?.includes(selectedCategory) ?? false);
      return matchesSearch && matchesChain && matchesCategory;
    });
  }, [search, selectedChain, selectedCategory]);

  /** Update the chainId in the URL without navigation */
  const updateChainInUrl = useCallback((appUrl: string, chainId: number) => {
    const params = new URLSearchParams();
    params.set("url", appUrl);
    params.set("chainId", String(chainId));
    router.replace(`/apps?${params.toString()}`, { scroll: false });
  }, [router]);

  const savedScrollY = useRef(0);

  /** Navigate back to the grid, clearing the URL param */
  const handleBack = useCallback(() => {
    document.title = "WalletChan - The Wallet for AI Era";
    router.replace("/apps", { scroll: false });
    setActiveDapp(null);
    setCustomUrl(null);
    setCustomUrlName(null);
    // Restore scroll after React re-renders the grid
    requestAnimationFrame(() => window.scrollTo(0, savedScrollY.current));
  }, [router]);

  /** Open a known dapp */
  const openDapp = useCallback((dapp: DappEntry) => {
    savedScrollY.current = window.scrollY;
    router.push(`/apps?url=${encodeURIComponent(dapp.url)}`);
    setActiveDapp(dapp);
  }, [router]);

  /** Open a custom URL */
  const openCustomUrl = useCallback((url: string, name?: string | null) => {
    savedScrollY.current = window.scrollY;
    router.push(`/apps?url=${encodeURIComponent(url)}`);
    setCustomUrl(url);
    if (name) setCustomUrlName(name);
  }, [router]);

  // If a dapp is selected, show the iframe view
  if (activeDapp) {
    return (
      <IframeApp
        appUrl={activeDapp.url}
        appName={activeDapp.name}
        appIconUrl={activeDapp.iconUrl}
        supportedChains={activeDapp.chains}
        autoConnect={activeDapp.autoConnect}
        initialChainId={initialChainId}
        onChainChange={(chainId) => updateChainInUrl(activeDapp.url, chainId)}
        onBack={handleBack}
      />
    );
  }

  // If a custom URL is entered, show the iframe view with all chains
  if (customUrl) {
    const hostname = (() => {
      try { return new URL(customUrl).hostname; } catch { return customUrl; }
    })();
    return (
      <IframeApp
        appUrl={customUrl}
        appName={customUrlName || hostname}
        supportedChains={availableChains}
        initialChainId={initialChainId}
        onChainChange={(chainId) => updateChainInUrl(customUrl, chainId)}
        onBack={handleBack}
      />
    );
  }

  return (
    <Box minH="100vh" bg="bauhaus.background">
      {/* Preload character image so it's instant when opening a dapp */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/walletchan-icon-nobg.png" alt="" style={{ display: "none" }} />
      <Navigation />
      <TokenBanner />

      <Container maxW="7xl" py={10}>
        <VStack spacing={8} align="stretch">
          {/* Header with centered title and connect wallet top-right */}
          <Box position="relative">
            <VStack spacing={2} textAlign="center">
              <HStack spacing={3} justify="center">
                <Box
                  w="14px"
                  h="14px"
                  bg="bauhaus.red"
                  border="3px solid"
                  borderColor="bauhaus.black"
                />
                <Text
                  fontSize={{ base: "2xl", md: "3xl" }}
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  App Store
                </Text>
                <Box
                  w="14px"
                  h="14px"
                  bg="bauhaus.blue"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius="full"
                />
              </HStack>
              <Text fontSize="sm" color="gray.500" fontWeight="500">
                Connect wallet once and interact with multiple Web3 dapps easily
              </Text>
            </VStack>
            <Box
              position={{ base: "relative", md: "absolute" }}
              right={{ md: 0 }}
              top={{ md: "50%" }}
              transform={{ md: "translateY(-50%)" }}
              mt={{ base: 3, md: 0 }}
              display="flex"
              justifyContent="center"
            >
              <ConnectButton />
            </Box>
          </Box>

          {/* Search + Chain Filter on same line */}
          <Flex
            maxW="600px"
            mx="auto"
            w="full"
            gap={3}
            direction={{ base: "column", sm: "row" }}
          >
            <InputGroup flex={1}>
              <InputLeftElement pointerEvents="none">
                <Search size={16} color="gray" />
              </InputLeftElement>
              <Input
                placeholder="Search dApps or enter URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isUrl(search)) {
                    openCustomUrl(normalizeUrl(search));
                  }
                }}
                bg="white"
                border="3px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                fontWeight="600"
                _placeholder={{ color: "gray.400" }}
                _focus={{
                  borderColor: "bauhaus.blue",
                  boxShadow: "none",
                }}
              />
            </InputGroup>

            <ChainFilterDropdown
              availableChains={availableChains}
              chainCounts={chainCounts}
              selectedChain={selectedChain}
              onSelect={setSelectedChain}
            />
          </Flex>

          {/* Category Filter Bar */}
          <Flex
            gap={2}
            overflowX="auto"
            pb={2}
            justify="center"
            flexWrap="wrap"
            css={{
              "&::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: "none",
            }}
          >
            <Button
              size="sm"
              bg={selectedCategory === null ? "bauhaus.black" : "transparent"}
              color={selectedCategory === null ? "white" : "gray.500"}
              border="2px solid"
              borderColor={selectedCategory === null ? "bauhaus.black" : "gray.200"}
              borderRadius="full"
              fontWeight="800"
              textTransform="uppercase"
              fontSize="xs"
              letterSpacing="wide"
              px={4}
              flexShrink={0}
              onClick={() => setSelectedCategory(null)}
              boxShadow={
                selectedCategory === null
                  ? "3px 3px 0px 0px var(--chakra-colors-bauhaus-black)"
                  : "none"
              }
              _hover={{ bg: selectedCategory === null ? "bauhaus.black" : "gray.50" }}
              _active={{
                transform: "translate(2px, 2px)",
                boxShadow: "none",
              }}
            >
              All
            </Button>
            {CATEGORIES.map((cat) => {
              const [catBg] = CATEGORY_COLORS[cat] || ["#1040C0"];
              const isSelected = selectedCategory === cat;
              return (
              <Button
                key={cat}
                size="sm"
                bg={isSelected ? catBg : `${catBg}10`}
                color={isSelected ? "white" : catBg}
                border="2px solid"
                borderColor={isSelected ? catBg : `${catBg}30`}
                borderRadius="full"
                fontWeight="800"
                textTransform="uppercase"
                fontSize="xs"
                letterSpacing="wide"
                px={4}
                flexShrink={0}
                onClick={() =>
                  setSelectedCategory(isSelected ? null : cat)
                }
                boxShadow={
                  isSelected
                    ? "3px 3px 0px 0px var(--chakra-colors-bauhaus-black)"
                    : "none"
                }
                _hover={{ bg: isSelected ? catBg : `${catBg}20` }}
                _active={{
                  transform: "translate(2px, 2px)",
                  boxShadow: "none",
                }}
              >
                {CATEGORY_LABELS[cat] || cat}
              </Button>
              );
            })}
          </Flex>

          {/* Custom URL card when search looks like a URL */}
          {isUrl(search) && (
            <CustomUrlCard
              url={normalizeUrl(search)}
              onOpen={(name) => {
                openCustomUrl(normalizeUrl(search), name);
              }}
            />
          )}

          {/* Dapp Grid */}
          {filteredDapps.length > 0 ? (
            <SimpleGrid
              columns={{ base: 1, sm: 2, md: 3, lg: 4 }}
              spacing={4}
            >
              {filteredDapps.map((dapp) => (
                <AppCard
                  key={dapp.id}
                  dapp={dapp}
                  selectedChain={selectedChain}
                  onClick={() => openDapp(dapp)}
                />
              ))}
            </SimpleGrid>
          ) : !isUrl(search) ? (
            <Box textAlign="center" py={12}>
              <Text
                fontWeight="700"
                textTransform="uppercase"
                color="gray.500"
              >
                No dApps found
              </Text>
              <Text fontSize="sm" color="gray.400" mt={2}>
                Try adjusting your search or filters
              </Text>
            </Box>
          ) : null}
        </VStack>
      </Container>
    </Box>
  );
}

/** Custom URL card — fetches favicon + meta description */
function CustomUrlCard({ url, onOpen }: { url: string; onOpen: (name: string | null) => void }) {
  const [meta, setMeta] = useState<{ title: string | null; description: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUrlRef = useRef(url);

  // Extract domain for favicon
  let domain = url;
  try { domain = new URL(url).hostname; } catch {}
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  useEffect(() => {
    // Reset when URL changes
    if (prevUrlRef.current !== url) {
      setMeta(null);
      setLoading(true);
      prevUrlRef.current = url;
    }

    const controller = new AbortController();
    fetch(`/api/meta?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setMeta(data);
        setLoading(false);
      })
      .catch(() => {
        setMeta(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, [url]);

  return (
    <Box
      as="button"
      maxW="400px"
      mx="auto"
      w="full"
      bg="white"
      border="2px solid"
      borderColor="bauhaus.blue"
      borderRadius="16px"
      boxShadow="3px 3px 0px 0px var(--chakra-colors-bauhaus-blue)"
      p={5}
      textAlign="left"
      cursor="pointer"
      transition="all 0.15s ease-out"
      _hover={{
        transform: "translate(-2px, -2px)",
        boxShadow: "5px 5px 0px 0px var(--chakra-colors-bauhaus-blue)",
      }}
      _active={{
        transform: "translate(3px, 3px)",
        boxShadow: "none",
      }}
      onClick={() => onOpen(meta?.title || null)}
    >
      <HStack spacing={3} align="start">
        {loading ? (
          <SkeletonCircle size="48px" flexShrink={0} />
        ) : (
          <Image
            src={faviconUrl}
            alt={domain}
            w="48px"
            h="48px"
            borderRadius="full"
            flexShrink={0}
            fallback={
              <Box
                w="48px"
                h="48px"
                bg="bauhaus.blue"
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Globe size={24} color="white" />
              </Box>
            }
          />
        )}
        <VStack align="start" spacing={0.5} flex={1} minW={0}>
          {loading ? (
            <>
              <Skeleton h="16px" w="60%" />
              <Skeleton h="12px" w="90%" />
            </>
          ) : (
            <>
              <Text
                fontWeight="900"
                fontSize="sm"
                textTransform="uppercase"
                letterSpacing="wide"
                noOfLines={1}
              >
                {meta?.title || domain}
              </Text>
              <Text fontSize="xs" color="gray.600" noOfLines={2} lineHeight="short">
                {meta?.description || url}
              </Text>
            </>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}

/** Chain filter dropdown button + popover */
function ChainFilterDropdown({
  availableChains,
  chainCounts,
  selectedChain,
  onSelect,
}: {
  availableChains: number[];
  chainCounts: Record<number, number>;
  selectedChain: number | null;
  onSelect: (chain: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      placement="bottom-end"
      isLazy
    >
      <PopoverTrigger>
        <Button
          bg={selectedChain ? getChainColor(selectedChain) : "white"}
          color={selectedChain ? getChainTextColor(selectedChain) : "bauhaus.black"}
          border="3px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          fontWeight="800"
          textTransform="uppercase"
          fontSize="xs"
          letterSpacing="wide"
          px={4}
          h="40px"
          minW={{ base: "full", sm: "160px" }}
          onClick={() => setIsOpen(!isOpen)}
          _hover={{ opacity: 0.85 }}
          _active={{
            transform: "translate(2px, 2px)",
            boxShadow: "none",
          }}
          boxShadow="3px 3px 0px 0px var(--chakra-colors-bauhaus-black)"
          rightIcon={<ChevronDown size={14} />}
          leftIcon={selectedChain ? <ChainIcon chainId={selectedChain} size="14px" /> : undefined}
        >
          {selectedChain
            ? CHAIN_NAMES[selectedChain] || `Chain ${selectedChain}`
            : "All Chains"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        bg="white"
        border="3px solid"
        borderColor="bauhaus.black"
        borderRadius="0"
        boxShadow="6px 6px 0px 0px var(--chakra-colors-bauhaus-black)"
        w="240px"
        _focus={{ outline: "none" }}
      >
        <PopoverBody p={0} maxH="320px" overflowY="auto">
          {/* All Chains option */}
          <Box
            as="button"
            w="full"
            textAlign="left"
            px={4}
            py={2.5}
            bg={selectedChain === null ? "bauhaus.blue" : "white"}
            color={selectedChain === null ? "white" : "bauhaus.black"}
            fontWeight="800"
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="wide"
            borderBottom="2px solid"
            borderColor="gray.200"
            _hover={{ bg: selectedChain === null ? "bauhaus.blue" : "gray.50" }}
            onClick={() => {
              onSelect(null);
              setIsOpen(false);
            }}
          >
            <HStack justify="space-between">
              <Text>All Chains</Text>
              <Text fontWeight="600" opacity={0.6}>
                {DAPPS.length}
              </Text>
            </HStack>
          </Box>

          {availableChains.map((chainId) => (
            <Box
              key={chainId}
              as="button"
              w="full"
              textAlign="left"
              px={4}
              py={2.5}
              bg={selectedChain === chainId ? "bauhaus.blue" : "white"}
              color={selectedChain === chainId ? "white" : "bauhaus.black"}
              fontWeight="700"
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="wide"
              borderBottom="1px solid"
              borderColor="gray.100"
              _hover={{
                bg:
                  selectedChain === chainId ? "bauhaus.blue" : "gray.50",
              }}
              onClick={() => {
                onSelect(selectedChain === chainId ? null : chainId);
                setIsOpen(false);
              }}
            >
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <ChainIcon chainId={chainId} size="12px" />
                  <Text>
                    {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                  </Text>
                </HStack>
                <Text fontWeight="600" opacity={0.5} fontSize="10px">
                  {chainCounts[chainId] || 0}
                </Text>
              </HStack>
            </Box>
          ))}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

