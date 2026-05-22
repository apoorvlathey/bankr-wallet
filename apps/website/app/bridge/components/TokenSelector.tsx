"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Divider,
  HStack,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useDisclosure,
} from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import {
  formatBalance,
  type PortfolioToken,
} from "../../api/portfolio/providers/types";
import { BUNGEE_NATIVE_TOKEN, type BungeeToken } from "@walletchan/shared/bungee";

interface TokenSelectorProps {
  tokens: BungeeToken[];
  selectedAddress?: string;
  onChange: (token: BungeeToken) => void;
  label: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** User's portfolio on the SAME chain as `tokens`. Optional. */
  holdings?: PortfolioToken[];
  /** Popular token symbols for this chain. */
  popularSymbols?: string[];
}

/** Bungee's native sentinel for matching against holdings (which use "native"). */
function holdingAddress(t: PortfolioToken): string {
  return t.contractAddress === "native"
    ? BUNGEE_NATIVE_TOKEN
    : t.contractAddress.toLowerCase();
}

/** Best-effort lookup of a BungeeToken record by symbol — used when a
 *  popular-token row is clicked and we need the Bungee schema (not Portfolio). */
function findTokenBySymbol(
  tokens: BungeeToken[],
  symbol: string,
): BungeeToken | undefined {
  const upper = symbol.toUpperCase();
  return tokens.find((t) => t.symbol?.toUpperCase() === upper);
}

export function TokenSelector({
  tokens,
  selectedAddress,
  onChange,
  label,
  isLoading,
  disabled,
  holdings,
  popularSymbols,
}: TokenSelectorProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () =>
      tokens.find(
        (t) => t.address?.toLowerCase() === selectedAddress?.toLowerCase(),
      ),
    [tokens, selectedAddress],
  );

  const heldAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) set.add(holdingAddress(h));
    return set;
  }, [holdings]);

  // Find a BungeeToken record for each holding so we can re-emit it on select.
  const holdingsWithToken = useMemo(() => {
    if (!holdings) return [];
    return holdings
      .map((h) => {
        const addr = holdingAddress(h);
        const tok = tokens.find((t) => t.address?.toLowerCase() === addr);
        return tok ? { holding: h, token: tok } : null;
      })
      .filter((x): x is { holding: PortfolioToken; token: BungeeToken } => !!x);
  }, [holdings, tokens]);

  // Popular tokens — drop any that the user already holds (those render in the
  // holdings section) and any not present in the Bungee token list.
  const popularTokens = useMemo(() => {
    if (!popularSymbols?.length) return [];
    const out: BungeeToken[] = [];
    for (const sym of popularSymbols) {
      const tok = findTokenBySymbol(tokens, sym);
      if (!tok) continue;
      if (heldAddresses.has(tok.address.toLowerCase())) continue;
      out.push(tok);
    }
    return out;
  }, [popularSymbols, tokens, heldAddresses]);

  const filteredHoldings = useMemo(() => {
    if (!query) return holdingsWithToken;
    const q = query.toLowerCase();
    return holdingsWithToken.filter(
      ({ holding, token }) =>
        token.symbol?.toLowerCase().includes(q) ||
        token.name?.toLowerCase().includes(q) ||
        token.address?.toLowerCase() === q ||
        holding.symbol.toLowerCase().includes(q),
    );
  }, [holdingsWithToken, query]);

  const filteredRest = useMemo(() => {
    const base = tokens.filter(
      (t) => !heldAddresses.has(t.address?.toLowerCase() ?? ""),
    );
    if (!query) return base.slice(0, 200);
    const q = query.toLowerCase();
    return base
      .filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address?.toLowerCase() === q,
      )
      .slice(0, 200);
  }, [tokens, heldAddresses, query]);

  const handlePick = (t: BungeeToken) => {
    onChange(t);
    setQuery("");
    onClose();
  };

  const isSelectedAddr = (addr?: string) =>
    !!addr &&
    !!selectedAddress &&
    addr.toLowerCase() === selectedAddress.toLowerCase();

  return (
    <Box>
      <Text
        fontSize="2xs"
        fontWeight="bold"
        color="gray.500"
        textTransform="uppercase"
        letterSpacing="wider"
        mb={1}
      >
        {label}
      </Text>
      <Box
        as="button"
        w="full"
        bg="white"
        border="2px solid"
        borderColor="bauhaus.border"
        px={3}
        py={2}
        cursor={disabled ? "not-allowed" : "pointer"}
        opacity={disabled ? 0.6 : 1}
        onClick={() => {
          if (!disabled) onOpen();
        }}
        _hover={!disabled ? { boxShadow: "2px 2px 0px 0px #121212" } : undefined}
        textAlign="left"
      >
        <HStack justify="space-between">
          <HStack spacing={2}>
            {isLoading ? (
              <Spinner size="xs" />
            ) : selected ? (
              <>
                {(selected.icon || selected.logoURI) && (
                  <Image
                    src={selected.icon ?? selected.logoURI}
                    alt={selected.symbol}
                    boxSize="20px"
                    borderRadius="full"
                  />
                )}
                <Text fontWeight="bold">{selected.symbol}</Text>
              </>
            ) : (
              <Text color="gray.400" fontWeight="bold">
                Select token
              </Text>
            )}
          </HStack>
          <ChevronDown size={16} />
        </HStack>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
        <ModalOverlay />
        <ModalContent
          border="2px solid"
          borderColor="bauhaus.border"
          borderRadius={0}
          boxShadow="6px 6px 0px 0px #121212"
        >
          <ModalHeader fontWeight="black" textTransform="uppercase">
            Select Token
          </ModalHeader>
          <ModalBody pb={4}>
            <Input
              placeholder="Search by name, symbol, or address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              border="2px solid"
              borderColor="bauhaus.border"
              borderRadius={0}
              mb={3}
              _focus={{
                boxShadow: "2px 2px 0px 0px #121212",
                borderColor: "bauhaus.border",
              }}
            />

            {/* Popular tokens chips */}
            {!query && popularTokens.length > 0 && (
              <>
                <Text
                  fontSize="2xs"
                  fontWeight="black"
                  color="gray.500"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  mb={2}
                >
                  Popular
                </Text>
                <Wrap spacing={2} mb={3}>
                  {popularTokens.map((t) => (
                    <WrapItem key={t.address}>
                      <HStack
                        as="button"
                        spacing={1.5}
                        px={2}
                        py={1}
                        border="2px solid"
                        borderColor={
                          isSelectedAddr(t.address)
                            ? "bauhaus.blue"
                            : "bauhaus.border"
                        }
                        bg={isSelectedAddr(t.address) ? "bauhaus.muted" : "white"}
                        _hover={{ boxShadow: "2px 2px 0px 0px #121212" }}
                        onClick={() => handlePick(t)}
                      >
                        {(t.icon || t.logoURI) && (
                          <Image
                            src={t.icon ?? t.logoURI}
                            alt={t.symbol}
                            boxSize="16px"
                            borderRadius="full"
                          />
                        )}
                        <Text
                          fontWeight="black"
                          fontSize="xs"
                          textTransform="uppercase"
                        >
                          {t.symbol}
                        </Text>
                      </HStack>
                    </WrapItem>
                  ))}
                </Wrap>
              </>
            )}

            <VStack
              spacing={1}
              align="stretch"
              maxH="400px"
              overflowY="auto"
            >
              {/* Your tokens section */}
              {filteredHoldings.length > 0 && (
                <>
                  <Text
                    fontSize="2xs"
                    fontWeight="black"
                    color="gray.500"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    px={2}
                    pt={1}
                  >
                    Your Tokens
                  </Text>
                  {filteredHoldings.map(({ holding, token }) => (
                    <HStack
                      key={`held-${token.chainId}-${token.address}`}
                      as="button"
                      spacing={2}
                      p={2}
                      cursor="pointer"
                      bg={
                        isSelectedAddr(token.address)
                          ? "bauhaus.muted"
                          : "transparent"
                      }
                      _hover={{ bg: "bauhaus.muted" }}
                      onClick={() => handlePick(token)}
                      textAlign="left"
                    >
                      {(token.icon || token.logoURI || holding.logoUrl) && (
                        <Image
                          src={
                            token.icon ?? token.logoURI ?? holding.logoUrl
                          }
                          alt={token.symbol}
                          boxSize="24px"
                          borderRadius="full"
                        />
                      )}
                      <VStack spacing={0} align="flex-start" flex={1} minW={0}>
                        <Text fontWeight="bold" fontSize="sm">
                          {token.symbol}
                        </Text>
                        <Text
                          fontSize="2xs"
                          color="gray.500"
                          noOfLines={1}
                        >
                          {token.name}
                        </Text>
                      </VStack>
                      <VStack spacing={0} align="flex-end" flexShrink={0}>
                        <Text
                          fontSize="xs"
                          fontWeight="bold"
                          fontFamily="mono"
                        >
                          {formatBalance(holding.balance)}
                        </Text>
                        {holding.valueUsd > 0 && (
                          <Text fontSize="2xs" color="gray.500">
                            ${holding.valueUsd.toFixed(2)}
                          </Text>
                        )}
                      </VStack>
                    </HStack>
                  ))}
                  {filteredRest.length > 0 && <Divider my={1} />}
                </>
              )}

              {filteredRest.length === 0 && filteredHoldings.length === 0 && (
                <Text fontSize="sm" color="gray.500" p={2}>
                  No matches
                </Text>
              )}

              {/* All tokens */}
              {filteredRest.map((t) => (
                <HStack
                  key={`all-${t.chainId}-${t.address}`}
                  as="button"
                  spacing={2}
                  p={2}
                  cursor="pointer"
                  bg={
                    isSelectedAddr(t.address) ? "bauhaus.muted" : "transparent"
                  }
                  _hover={{ bg: "bauhaus.muted" }}
                  onClick={() => handlePick(t)}
                  textAlign="left"
                >
                  {(t.icon || t.logoURI) && (
                    <Image
                      src={t.icon ?? t.logoURI}
                      alt={t.symbol}
                      boxSize="24px"
                      borderRadius="full"
                    />
                  )}
                  <VStack spacing={0} align="flex-start" flex={1} minW={0}>
                    <Text fontWeight="bold" fontSize="sm">
                      {t.symbol}
                    </Text>
                    <Text fontSize="2xs" color="gray.500" noOfLines={1}>
                      {t.name}
                    </Text>
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
