"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Input, InputGroup, InputLeftElement, InputRightElement, Text, Image, VStack } from "@chakra-ui/react";
import { Search, Globe } from "lucide-react";
import { LoadingShapes } from "../../components/ui/LoadingShapes";
import { WIN95_FONT } from "./win95styles";

interface SearchResult {
  name: string;
  logo: string;
  route: string;
}

interface CustomUrlMeta {
  title: string | null;
  description: string | null;
  favicon: string | null;
}

interface SearchBarProps {
  onOpenUrl: (url: string, name?: string) => void;
}

const SEARCH_KEY = process.env.NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY || "";

function isUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed);
}

function normalizeUrl(text: string): string {
  return text.trim();
}

export function SearchBar({ onOpenUrl }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [customUrlMeta, setCustomUrlMeta] = useState<CustomUrlMeta | null>(null);
  const [customUrlLoading, setCustomUrlLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setCustomUrlMeta(null);
      setIsOpen(false);
      setLoading(false);
      setCustomUrlLoading(false);
      return;
    }

    const isUrlInput = isUrl(q);

    // Fetch meta for custom URL
    if (isUrlInput) {
      metaAbortRef.current?.abort();
      const controller = new AbortController();
      metaAbortRef.current = controller;
      setCustomUrlLoading(true);
      setCustomUrlMeta(null);
      fetch(`/api/meta?url=${encodeURIComponent(normalizeUrl(q))}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setCustomUrlMeta(data);
          setCustomUrlLoading(false);
          setIsOpen(true);
        })
        .catch(() => {
          setCustomUrlLoading(false);
        });
    } else {
      setCustomUrlMeta(null);
      setCustomUrlLoading(false);
    }

    // Always search DefiLlama too (for URL inputs, search the domain name)
    if (SEARCH_KEY) {
      const searchQuery = isUrlInput
        ? (() => { try { return new URL(normalizeUrl(q)).hostname.replace(/^www\./, "").split(".")[0]; } catch { return q; } })()
        : q.trim();

      setLoading(true);
      try {
        const res = await fetch("https://search-core.defillama.com/multi-search", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${SEARCH_KEY}`,
          },
          body: JSON.stringify({
            queries: [
              {
                indexUid: "directory",
                q: searchQuery,
                limit: 8,
                attributesToRetrieve: ["name", "logo", "route"],
              },
            ],
          }),
        });

        const data = await res.json();
        const hits: SearchResult[] = data.results?.[0]?.hits ?? [];
        setResults(hits.filter((h) => h.route));
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    } else if (isUrlInput) {
      setIsOpen(true);
      setSelectedIndex(-1);
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 250);
    },
    [search]
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setIsOpen(false);
      setQuery("");
      onOpenUrl(result.route, result.name);
    },
    [onOpenUrl]
  );

  const hasCustomUrl = isUrl(query) && (customUrlMeta || customUrlLoading);
  const totalItems = (hasCustomUrl ? 1 : 0) + results.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || totalItems === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex === -1 && isUrl(query)) {
          // Enter with no selection on a URL — open it directly
          setIsOpen(false);
          setQuery("");
          const url = normalizeUrl(query);
          onOpenUrl(url, customUrlMeta?.title ?? undefined);
        } else if (hasCustomUrl && selectedIndex === 0) {
          setIsOpen(false);
          setQuery("");
          const url = normalizeUrl(query);
          onOpenUrl(url, customUrlMeta?.title ?? undefined);
        } else if (selectedIndex >= 0) {
          const resultIndex = hasCustomUrl ? selectedIndex - 1 : selectedIndex;
          if (results[resultIndex]) handleSelect(results[resultIndex]);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [isOpen, totalItems, selectedIndex, hasCustomUrl, query, customUrlMeta, results, handleSelect, onOpenUrl]
  );

  return (
    <Box
      ref={containerRef}
      position="relative"
      w="100%"
      maxW="520px"
    >
      {/* Heading */}
      <Box
        as="a"
        href="https://search.defillama.com/"
        target="_blank"
        rel="noopener noreferrer"
        display="flex"
        alignItems="center"
        gap="8px"
        mb={2}
        ml={5}
        _hover={{ opacity: 0.8 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://www.google.com/s2/favicons?domain=defillama.com&sz=32"
          alt="DefiLlama"
          width={20}
          height={20}
          style={{ borderRadius: "4px" }}
        />
        <Text
          fontFamily={WIN95_FONT}
          fontSize="13px"
          fontWeight="bold"
          color="white"
          textShadow="1px 1px 2px rgba(0,0,0,0.5)"
        >
          DefiLlama Search
        </Text>
      </Box>

      <Box position="relative">
      <InputGroup size="md">
        <InputLeftElement pointerEvents="none" h="44px">
          <Search size={16} color="rgba(255,255,255,0.45)" />
        </InputLeftElement>
        {(loading || customUrlLoading) && (
          <InputRightElement pointerEvents="none" h="44px" w="50px">
            <LoadingShapes />
          </InputRightElement>
        )}
        <Input
          placeholder="Search dApps or enter URL..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || hasCustomUrl) setIsOpen(true);
          }}
          bg="rgba(255, 255, 255, 0.12)"
          backdropFilter="blur(12px)"
          color="white"
          fontFamily={WIN95_FONT}
          fontSize="13px"
          borderRadius="full"
          h="44px"
          border="1px solid rgba(255,255,255,0.15)"
          _focus={{ borderColor: "rgba(255,255,255,0.4)", boxShadow: "0 0 0 1px rgba(255,255,255,0.15)" }}
          _placeholder={{ color: "whiteAlpha.500" }}
          _hover={{ borderColor: "rgba(255,255,255,0.25)" }}
        />
      </InputGroup>

      {/* Dropdown results */}
      {isOpen && totalItems > 0 && (
        <VStack
          position="absolute"
          top="calc(100% + 4px)"
          left={0}
          right={0}
          bg="rgba(15, 23, 42, 0.85)"
          backdropFilter="blur(12px)"
          border="1px solid rgba(255,255,255,0.12)"
          borderRadius="xl"
          boxShadow="0 8px 32px rgba(0,0,0,0.4)"
          spacing={0}
          zIndex={9999}
          maxH="320px"
          overflowY="auto"
          align="stretch"
          py={1}
        >
          {/* Custom URL entry */}
          {hasCustomUrl && (() => {
            const url = normalizeUrl(query);
            let domain = "";
            try { domain = new URL(url).hostname; } catch {}
            const faviconUrl = customUrlMeta?.favicon
              || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            return (
              <Box
                key="custom-url"
                display="flex"
                alignItems="center"
                gap="10px"
                px={3}
                py="8px"
                mx={1}
                borderRadius="lg"
                cursor="pointer"
                bg={selectedIndex === 0 ? "rgba(255,255,255,0.12)" : "transparent"}
                color="white"
                _hover={{ bg: "rgba(255,255,255,0.1)" }}
                onClick={() => {
                  setIsOpen(false);
                  setQuery("");
                  onOpenUrl(url, customUrlMeta?.title ?? undefined);
                }}
              >
                {customUrlLoading ? (
                  <Box w="24px" h="24px" borderRadius="4px" bg="whiteAlpha.200" flexShrink={0} />
                ) : (
                  <Image
                    src={faviconUrl}
                    alt={domain}
                    w="24px"
                    h="24px"
                    borderRadius="4px"
                    flexShrink={0}
                    fallback={
                      <Box
                        w="24px" h="24px" bg="whiteAlpha.200" borderRadius="4px"
                        display="flex" alignItems="center" justifyContent="center" flexShrink={0}
                      >
                        <Globe size={14} color="rgba(255,255,255,0.6)" />
                      </Box>
                    }
                  />
                )}
                <Box flex={1} minW={0}>
                  <Text fontFamily={WIN95_FONT} fontSize="12px" fontWeight="bold" noOfLines={1}>
                    {customUrlMeta?.title || domain || url}
                  </Text>
                  <Text fontFamily={WIN95_FONT} fontSize="10px" color="whiteAlpha.500" noOfLines={1}>
                    {domain}
                  </Text>
                </Box>
              </Box>
            );
          })()}

          {/* Separator between custom URL and search results */}
          {hasCustomUrl && results.length > 0 && (
            <Box h="1px" bg="whiteAlpha.100" mx={3} my={1} />
          )}

          {/* DefiLlama search results */}
          {results.map((result, i) => {
            const idx = hasCustomUrl ? i + 1 : i;
            let domain = "";
            try {
              domain = new URL(result.route).hostname;
            } catch {}

            return (
              <Box
                key={`${result.route}-${i}`}
                display="flex"
                alignItems="center"
                gap="10px"
                px={3}
                py="8px"
                mx={1}
                borderRadius="lg"
                cursor="pointer"
                bg={idx === selectedIndex ? "rgba(255,255,255,0.12)" : "transparent"}
                color="white"
                _hover={{
                  bg: "rgba(255,255,255,0.1)",
                }}
                onClick={() => handleSelect(result)}
              >
                <Image
                  src={result.logo}
                  alt={result.name}
                  w="24px"
                  h="24px"
                  borderRadius="4px"
                  flexShrink={0}
                  fallback={
                    <Box
                      w="24px"
                      h="24px"
                      bg="#C0C0C0"
                      borderRadius="4px"
                      flexShrink={0}
                    />
                  }
                />
                <Box flex={1} minW={0}>
                  <Text
                    fontFamily={WIN95_FONT}
                    fontSize="12px"
                    fontWeight="bold"
                    noOfLines={1}
                  >
                    {result.name}
                  </Text>
                  <Text
                    fontFamily={WIN95_FONT}
                    fontSize="10px"
                    color="whiteAlpha.500"
                    noOfLines={1}
                  >
                    {domain}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </VStack>
      )}
      </Box>
    </Box>
  );
}
