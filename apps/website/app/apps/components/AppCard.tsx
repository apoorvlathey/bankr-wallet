"use client";

import {
  Box,
  HStack,
  VStack,
  Text,
  Image,
  Tooltip,
} from "@chakra-ui/react";
import type { DappEntry } from "../data/dapps";
import { CHAIN_NAMES } from "../data/dapps";
import { ChainIcon } from "./ChainIcon";

const MAX_VISIBLE_CHAINS = 4;

interface AppCardProps {
  dapp: DappEntry;
  selectedChain?: number | null;
  onClick: () => void;
}

export function AppCard({ dapp, onClick }: AppCardProps) {
  const visibleChains = dapp.chains.slice(0, MAX_VISIBLE_CHAINS);
  const overflowCount = dapp.chains.length - MAX_VISIBLE_CHAINS;

  return (
    <Box
      as="button"
      w="full"
      bg="white"
      border="4px solid"
      borderColor="bauhaus.black"
      boxShadow="6px 6px 0px 0px var(--chakra-colors-bauhaus-black)"
      p={4}
      textAlign="left"
      cursor="pointer"
      transition="all 0.15s ease-out"
      _hover={{
        transform: "translate(-2px, -2px)",
        boxShadow: "8px 8px 0px 0px var(--chakra-colors-bauhaus-black)",
      }}
      _active={{
        transform: "translate(3px, 3px)",
        boxShadow: "none",
      }}
      onClick={onClick}
    >
      <HStack spacing={3} align="start">
        <Image
          src={dapp.iconUrl}
          alt={dapp.name}
          w="40px"
          h="40px"
          borderRadius="sm"
          border="2px solid"
          borderColor="bauhaus.black"
          fallbackSrc="https://www.google.com/s2/favicons?domain=example.com&sz=64"
        />
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <Text
            fontWeight="900"
            fontSize="sm"
            textTransform="uppercase"
            letterSpacing="wide"
            noOfLines={1}
          >
            {dapp.name}
          </Text>
          <Text
            fontSize="xs"
            color="gray.600"
            noOfLines={2}
            lineHeight="short"
          >
            {dapp.description}
          </Text>
          {/* Compact chain indicators */}
          <HStack spacing={1.5} mt={1}>
            {visibleChains.map((chainId) => (
              <Tooltip
                key={chainId}
                label={CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                fontSize="xs"
                bg="bauhaus.black"
                color="white"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                px={2}
                py={1}
              >
                <Box>
                  <ChainIcon chainId={chainId} />
                </Box>
              </Tooltip>
            ))}
            {overflowCount > 0 && (
              <Tooltip
                label={dapp.chains
                  .slice(MAX_VISIBLE_CHAINS)
                  .map((id) => CHAIN_NAMES[id] || id)
                  .join(", ")}
                fontSize="xs"
                bg="bauhaus.black"
                color="white"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                px={2}
                py={1}
              >
                <Text
                  fontSize="9px"
                  fontWeight="800"
                  color="gray.500"
                  lineHeight="10px"
                  flexShrink={0}
                >
                  +{overflowCount}
                </Text>
              </Tooltip>
            )}
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}
