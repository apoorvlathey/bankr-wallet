"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Flex,
  Image,
  Skeleton,
  SkeletonCircle,
} from "@chakra-ui/react";
import { Search, Globe } from "lucide-react";
import {
  DAPPS,
  CHAIN_NAMES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from "../data/dapps";
import { AppCard } from "../components/AppCard";
import { ChainIcon } from "../components/ChainIcon";
import {
  WIN95_FONT,
  BUTTON_FACE,
  BUTTON_SHADOW,
  BUTTON_HIGHLIGHT,
  BUTTON_DARK_SHADOW,
  ACCENT_BLUE,
  sunkenBorder,
} from "./win95styles";

interface AppStoreContentProps {
  isInstalled: (dappId: number) => boolean;
  onInstall: (dappId: number) => void;
  onUninstall: (dappId: number) => void;
  onOpenDapp: (dappId: number) => void;
  onOpenCustomUrl: (url: string, name?: string) => void;
  isCustomAppInstalled: (url: string) => boolean;
  onInstallCustomApp: (url: string, name?: string) => void;
  onUninstallCustomApp: (url: string) => void;
}

export function AppStoreContent({
  isInstalled,
  onInstall,
  onUninstall,
  onOpenDapp,
  onOpenCustomUrl,
  isCustomAppInstalled,
  onInstallCustomApp,
  onUninstallCustomApp,
}: AppStoreContentProps) {
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const availableChains = useMemo(() => {
    const chainSet = new Set<number>();
    DAPPS.forEach((dapp) => dapp.chains.forEach((c) => chainSet.add(c)));
    return Array.from(chainSet).sort((a, b) => {
      if (a === 1) return -1;
      if (b === 1) return 1;
      const nameA = (CHAIN_NAMES[a] || `Chain ${a}`).toLowerCase();
      const nameB = (CHAIN_NAMES[b] || `Chain ${b}`).toLowerCase();
      return nameA.localeCompare(nameB);
    });
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
        !selectedCategory ||
        (dapp.categories?.includes(selectedCategory) ?? false);
      return matchesSearch && matchesChain && matchesCategory;
    });
  }, [search, selectedChain, selectedCategory]);

  /** Check if search looks like a URL */
  const isUrl = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    return /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed);
  }, []);

  const normalizeUrl = useCallback((text: string) => {
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }, []);

  return (
    <Box
      h="100%"
      overflow="auto"
      bg={BUTTON_FACE}
      fontFamily={WIN95_FONT}
    >
      <VStack spacing={3} p={3} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <Text fontWeight="bold" fontSize="13px">
            Browse &amp; Install dApps
          </Text>
        </HStack>

        {/* Search */}
        <Box>
          <InputGroup size="sm">
            <InputLeftElement pointerEvents="none" h="24px">
              <Search size={12} color="gray" />
            </InputLeftElement>
            <Input
              placeholder="Search dApps or enter URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isUrl(search)) {
                  onOpenCustomUrl(normalizeUrl(search));
                }
              }}
              bg="white"
              fontFamily={WIN95_FONT}
              fontSize="11px"
              borderRadius="0"
              h="24px"
              {...sunkenBorder}
              _focus={{ borderColor: ACCENT_BLUE, boxShadow: "none" }}
            />
          </InputGroup>
        </Box>

        {/* Chain filter (horizontal pills) */}
        <Flex gap={1} flexWrap="wrap">
          <FilterPill
            label="All"
            isSelected={selectedChain === null}
            onClick={() => setSelectedChain(null)}
          />
          {availableChains.map((chainId) => (
            <FilterPill
              key={chainId}
              label={CHAIN_NAMES[chainId] || `${chainId}`}
              isSelected={selectedChain === chainId}
              onClick={() =>
                setSelectedChain(selectedChain === chainId ? null : chainId)
              }
              icon={<ChainIcon chainId={chainId} size="10px" />}
            />
          ))}
        </Flex>

        {/* Category filter */}
        <Flex gap={1} flexWrap="wrap">
          <FilterPill
            label="All"
            isSelected={selectedCategory === null}
            onClick={() => setSelectedCategory(null)}
          />
          {CATEGORIES.map((cat) => (
            <FilterPill
              key={cat}
              label={CATEGORY_LABELS[cat] || cat}
              isSelected={selectedCategory === cat}
              onClick={() =>
                setSelectedCategory(selectedCategory === cat ? null : cat)
              }
              color={CATEGORY_COLORS[cat]?.[0]}
            />
          ))}
        </Flex>

        {/* Custom URL card — shown when search looks like a URL */}
        {isUrl(search) && (
          <CustomUrlCard
            url={normalizeUrl(search)}
            onOpen={(name) => onOpenCustomUrl(normalizeUrl(search), name ?? undefined)}
            isInstalled={isCustomAppInstalled(normalizeUrl(search))}
            onInstall={(name) => onInstallCustomApp(normalizeUrl(search), name ?? undefined)}
            onUninstall={() => onUninstallCustomApp(normalizeUrl(search))}
          />
        )}

        {/* Dapp grid */}
        {filteredDapps.length > 0 ? (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={3}>
            {filteredDapps.map((dapp) => (
              <AppCard
                key={dapp.id}
                dapp={dapp}
                onClick={() => onOpenDapp(dapp.id)}
                isInstalled={isInstalled(dapp.id)}
                onInstall={() => onInstall(dapp.id)}
                onUninstall={() => onUninstall(dapp.id)}
              />
            ))}
          </SimpleGrid>
        ) : !isUrl(search) ? (
          <Box textAlign="center" py={8}>
            <Text fontWeight="bold" color="gray.500" fontSize="11px">
              No dApps found
            </Text>
          </Box>
        ) : null}
      </VStack>
    </Box>
  );
}

/** Small filter pill button */
function FilterPill({
  label,
  isSelected,
  onClick,
  icon,
  color,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <Box
      as="button"
      display="flex"
      alignItems="center"
      gap="3px"
      px="6px"
      py="2px"
      fontSize="10px"
      fontFamily={WIN95_FONT}
      fontWeight={isSelected ? "bold" : "normal"}
      bg={isSelected ? (color || "#000080") : BUTTON_FACE}
      color={isSelected ? "white" : "#000"}
      border={`1px solid ${isSelected ? (color || "#000080") : BUTTON_SHADOW}`}
      borderRadius="0"
      onClick={onClick}
      _hover={{
        bg: isSelected ? (color || "#000080") : "#dfdfdf",
      }}
      flexShrink={0}
    >
      {icon}
      {label}
    </Box>
  );
}

/** Custom URL card — fetches favicon + meta title/description */
function CustomUrlCard({
  url,
  onOpen,
  isInstalled,
  onInstall,
  onUninstall,
}: {
  url: string;
  onOpen: (name: string | null) => void;
  isInstalled: boolean;
  onInstall: (name: string | null) => void;
  onUninstall: () => void;
}) {
  const [meta, setMeta] = useState<{
    title: string | null;
    description: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUrlRef = useRef(url);

  let domain = url;
  try {
    domain = new URL(url).hostname;
  } catch {}
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  useEffect(() => {
    if (prevUrlRef.current !== url) {
      setMeta(null);
      setLoading(true);
      prevUrlRef.current = url;
    }

    const controller = new AbortController();
    fetch(`/api/meta?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
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
      w="full"
      bg="white"
      border={`1px solid ${BUTTON_SHADOW}`}
      p={3}
    >
      <HStack spacing={3} align="center">
        <Box
          cursor="pointer"
          onClick={() => onOpen(meta?.title || null)}
          display="flex"
          flexShrink={0}
        >
          {loading ? (
            <SkeletonCircle size="32px" />
          ) : (
            <Image
              src={faviconUrl}
              alt={domain}
              w="32px"
              h="32px"
              borderRadius="4px"
              fallback={
                <Box
                  w="32px"
                  h="32px"
                  bg={ACCENT_BLUE}
                  borderRadius="4px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Globe size={16} color="white" />
                </Box>
              }
            />
          )}
        </Box>
        <VStack
          align="start"
          spacing={0}
          flex={1}
          minW={0}
          cursor="pointer"
          onClick={() => onOpen(meta?.title || null)}
          _hover={{ "& > p:first-of-type": { textDecoration: "underline" } }}
        >
          {loading ? (
            <>
              <Skeleton h="12px" w="60%" />
              <Skeleton h="10px" w="90%" mt={1} />
            </>
          ) : (
            <>
              <Text
                fontFamily={WIN95_FONT}
                fontWeight="bold"
                fontSize="11px"
                noOfLines={1}
              >
                {meta?.title || domain}
              </Text>
              <Text
                fontFamily={WIN95_FONT}
                fontSize="10px"
                color="gray.500"
                noOfLines={1}
              >
                {meta?.description || url}
              </Text>
            </>
          )}
        </VStack>
        <Box
          as="button"
          px="8px"
          py="2px"
          fontSize="10px"
          fontFamily={WIN95_FONT}
          fontWeight="bold"
          flexShrink={0}
          bg={isInstalled ? BUTTON_FACE : ACCENT_BLUE}
          color={isInstalled ? "#000" : "white"}
          border={`1px solid ${isInstalled ? BUTTON_SHADOW : ACCENT_BLUE}`}
          _hover={{ opacity: 0.85 }}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            if (isInstalled) {
              onUninstall();
            } else {
              onInstall(meta?.title || null);
            }
          }}
        >
          {isInstalled ? "Installed ✓" : "Install"}
        </Box>
      </HStack>
    </Box>
  );
}
