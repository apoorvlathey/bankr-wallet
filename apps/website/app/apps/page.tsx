"use client";

import { useState, useMemo } from "react";
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
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
} from "@chakra-ui/react";
import { Search, ChevronDown } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navigation } from "../components/Navigation";
import { TokenBanner } from "../components/TokenBanner";
import { AppCard } from "./components/AppCard";
import { IframeApp } from "./components/IframeApp";
import { DAPPS, CHAIN_NAMES, getChainColor, getChainTextColor } from "./data/dapps";
import type { DappEntry } from "./data/dapps";
import { ChainIcon } from "./components/ChainIcon";

export default function AppsPage() {
  const [search, setSearch] = useState("");
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [activeDapp, setActiveDapp] = useState<DappEntry | null>(null);

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
      return matchesSearch && matchesChain;
    });
  }, [search, selectedChain]);

  // If a dapp is selected, show the iframe view
  if (activeDapp) {
    return (
      <IframeApp
        appUrl={activeDapp.url}
        appName={activeDapp.name}
        supportedChains={activeDapp.chains}
        onBack={() => setActiveDapp(null)}
      />
    );
  }

  return (
    <Box minH="100vh" bg="bauhaus.background">
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
                placeholder="Search dApps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                bg="white"
                border="3px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                fontWeight="600"
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
                  onClick={() => setActiveDapp(dapp)}
                />
              ))}
            </SimpleGrid>
          ) : (
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
          )}
        </VStack>
      </Container>
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

