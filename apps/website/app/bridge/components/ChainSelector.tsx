"use client";

import {
  Box,
  HStack,
  Image,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import type { BungeeChain } from "../types";

interface ChainSelectorProps {
  chains: BungeeChain[];
  selectedChainId?: number;
  onChange: (chainId: number) => void;
  label: string;
  isLoading?: boolean;
  disabled?: boolean;
  filter?: (chain: BungeeChain) => boolean;
}

export function ChainSelector({
  chains,
  selectedChainId,
  onChange,
  label,
  isLoading,
  disabled,
  filter,
}: ChainSelectorProps) {
  const visibleChains = filter ? chains.filter(filter) : chains;
  const selected = chains.find((c) => c.chainId === selectedChainId);

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
      <Menu>
        <MenuButton
          as={Box}
          w="full"
          bg="white"
          border="2px solid"
          borderColor="bauhaus.border"
          px={3}
          py={2}
          cursor={disabled ? "not-allowed" : "pointer"}
          opacity={disabled ? 0.6 : 1}
          _hover={!disabled ? { boxShadow: "2px 2px 0px 0px #121212" } : undefined}
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
                      alt={selected.name}
                      boxSize="20px"
                      borderRadius="full"
                    />
                  )}
                  <Text fontWeight="bold">{selected.name}</Text>
                </>
              ) : (
                <Text color="gray.400" fontWeight="bold">
                  Select chain
                </Text>
              )}
            </HStack>
            <ChevronDown size={16} />
          </HStack>
        </MenuButton>
        <MenuList
          maxH="320px"
          overflowY="auto"
          border="2px solid"
          borderColor="bauhaus.border"
          borderRadius={0}
          boxShadow="3px 3px 0px 0px #121212"
          py={0}
        >
          {visibleChains.length === 0 && (
            <Box p={3}>
              <Text fontSize="sm" color="gray.500">
                No chains available
              </Text>
            </Box>
          )}
          {visibleChains.map((c) => (
            <MenuItem
              key={c.chainId}
              onClick={() => onChange(c.chainId)}
              _hover={{ bg: "bauhaus.muted" }}
            >
              <HStack spacing={2}>
                {(c.icon || c.logoURI) && (
                  <Image
                    src={c.icon ?? c.logoURI}
                    alt={c.name}
                    boxSize="20px"
                    borderRadius="full"
                  />
                )}
                <Text fontWeight="bold">{c.name}</Text>
                <Text fontSize="xs" color="gray.500">
                  #{c.chainId}
                </Text>
              </HStack>
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Box>
  );
}
