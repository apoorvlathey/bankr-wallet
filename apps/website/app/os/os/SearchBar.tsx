"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Box, Input, InputGroup, InputLeftElement, InputRightElement, Text, Image, VStack } from "@chakra-ui/react";
import { Search } from "lucide-react";
import { LoadingShapes } from "../../components/ui/LoadingShapes";
import { WIN95_FONT } from "./win95styles";

interface SearchResult {
  name: string;
  logo: string;
  route: string;
}

interface SearchBarProps {
  onOpenUrl: (url: string, name?: string) => void;
}

const SEARCH_KEY = process.env.NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY || "";

export function SearchBar({ onOpenUrl }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !SEARCH_KEY) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

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
              q: q.trim(),
              limit: 8,
              attributesToRetrieve: ["name", "logo", "route"],
            },
          ],
        }),
      });

      const data = await res.json();
      const hits: SearchResult[] = data.results?.[0]?.hits ?? [];
      // Only show results that have a route (URL)
      setResults(hits.filter((h) => h.route));
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
      setIsOpen(false);
    } finally {
      setLoading(false);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [isOpen, results, selectedIndex, handleSelect]
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
        {loading && (
          <InputRightElement pointerEvents="none" h="44px" w="50px">
            <LoadingShapes />
          </InputRightElement>
        )}
        <Input
          placeholder="Search dApps..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
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
      {isOpen && results.length > 0 && (
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
          {results.map((result, i) => {
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
                bg={i === selectedIndex ? "rgba(255,255,255,0.12)" : "transparent"}
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
