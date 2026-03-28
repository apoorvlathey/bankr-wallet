import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  Text,
  Image,
  Box,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";

function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return parseFloat(num.toPrecision(6)).toString();
}

interface TokenSelectorProps {
  holdings: PortfolioToken[];
  selectedToken: PortfolioToken | null;
  onSelect: (token: PortfolioToken) => void;
  excludeAddress?: string;
}

export default function TokenSelector({
  holdings,
  selectedToken,
  onSelect,
  excludeAddress,
}: TokenSelectorProps) {
  return (
    <Menu>
      <MenuButton
        as={Box}
        cursor="pointer"
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        px={2}
        py={1.5}
        _hover={{ borderColor: "bauhaus.blue" }}
        display="flex"
        alignItems="center"
      >
        <HStack spacing={2}>
          {selectedToken?.logoUrl && (
            <Image
              src={selectedToken.logoUrl}
              boxSize="20px"
              borderRadius="full"
              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect fill='%23ccc' width='20' height='20'/%3E%3C/svg%3E"
            />
          )}
          <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
            {selectedToken?.symbol || "Select"}
          </Text>
          <ChevronDownIcon />
        </HStack>
      </MenuButton>
      <MenuList
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        borderRadius={0}
        boxShadow="4px 4px 0px 0px #121212"
        maxH="200px"
        overflowY="auto"
        p={0}
        zIndex={10}
      >
        {holdings.filter((token) => {
          if (!excludeAddress) return true;
          const addr = token.contractAddress === "native" ? "native" : token.contractAddress.toLowerCase();
          return addr !== excludeAddress.toLowerCase();
        }).map((token) => (
          <MenuItem
            key={`${token.contractAddress}-${token.chainId}`}
            onClick={() => onSelect(token)}
            bg={
              selectedToken?.contractAddress === token.contractAddress
                ? "bg.muted"
                : "transparent"
            }
            _hover={{ bg: "bg.hover" }}
            px={3}
            py={2}
          >
            <HStack spacing={2} w="full">
              <Image
                src={token.logoUrl}
                boxSize="20px"
                borderRadius="full"
                fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect fill='%23ccc' width='20' height='20'/%3E%3C/svg%3E"
              />
              <Box flex={1}>
                <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
                  {token.symbol}
                </Text>
                <Text fontSize="xs" color="text.tertiary">
                  {formatBalance(token.balance)}
                </Text>
              </Box>
              {token.valueUsd > 0 && (
                <Text fontSize="xs" color="text.secondary" fontWeight="500">
                  ${token.valueUsd.toFixed(2)}
                </Text>
              )}
            </HStack>
          </MenuItem>
        ))}
        {holdings.length === 0 && (
          <Box px={3} py={4}>
            <Text fontSize="sm" color="text.tertiary" textAlign="center">
              No tokens on Base
            </Text>
          </Box>
        )}
      </MenuList>
    </Menu>
  );
}
