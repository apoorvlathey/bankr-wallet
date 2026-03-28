import { useState, useEffect, useRef } from "react";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  Text,
  Image,
  Box,
  Input,
  Spinner,
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
  /** Remove outer border (for use inside a card that already has a border) */
  borderless?: boolean;
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
}

export default function TokenSelector({
  holdings,
  selectedToken,
  onSelect,
  excludeAddress,
  borderless,
  onCustomAddress,
  onSelectCustomToken,
  resolvedCustomToken,
  customTokenLoading,
  customTokenError,
  chainName,
}: TokenSelectorProps) {
  const [customAddr, setCustomAddr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastResolvedRef = useRef("");

  const filtered = holdings.filter((token) => {
    if (!excludeAddress) return true;
    const addr = token.contractAddress === "native" ? "native" : token.contractAddress.toLowerCase();
    return addr !== excludeAddress.toLowerCase();
  });

  // Auto-trigger resolution when a valid address is typed
  useEffect(() => {
    const val = customAddr.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(val) && onCustomAddress && val !== lastResolvedRef.current) {
      lastResolvedRef.current = val;
      onCustomAddress(val);
    }
  }, [customAddr]);

  // Reset resolved ref when menu reopens
  const handleMenuOpen = () => {
    lastResolvedRef.current = "";
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <Menu onOpen={handleMenuOpen}>
      <MenuButton
        as={Box}
        cursor="pointer"
        border={borderless ? "none" : "3px solid"}
        borderColor="bauhaus.black"
        bg={borderless ? "transparent" : "bauhaus.white"}
        px={borderless ? 0 : 2}
        py={borderless ? 0 : 1.5}
        _hover={borderless ? { opacity: 0.7 } : { borderColor: "bauhaus.blue" }}
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
        maxH="260px"
        overflowY="auto"
        p={0}
        zIndex={10}
      >
        {/* Custom address input */}
        {onCustomAddress && (
          <Box px={2} py={2} borderBottom="1px solid" borderColor="gray.200">
            <Input
              ref={inputRef}
              placeholder="Paste token address (0x...)"
              value={customAddr}
              onChange={(e) => setCustomAddr(e.target.value.trim())}
              onKeyDown={(e) => e.stopPropagation()}
              fontFamily="mono"
              fontSize="xs"
              size="sm"
              border="2px solid"
              borderColor="bauhaus.black"
              borderRadius={0}
              bg="bauhaus.white"
              _hover={{ borderColor: "bauhaus.blue" }}
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
            />
          </Box>
        )}

        {/* Loading state for custom token */}
        {customTokenLoading && (
          <HStack px={3} py={3} spacing={2} borderBottom="1px solid" borderColor="gray.200">
            <Spinner size="xs" color="bauhaus.blue" />
            <Text fontSize="xs" fontWeight="700" color="text.tertiary">
              Loading token...
            </Text>
          </HStack>
        )}

        {/* Error state for custom token */}
        {customTokenError && !customTokenLoading && (
          <Box px={3} py={2} borderBottom="1px solid" borderColor="gray.200">
            <Text fontSize="xs" fontWeight="700" color="bauhaus.red">
              {customTokenError}
            </Text>
          </Box>
        )}

        {/* Resolved custom token */}
        {resolvedCustomToken && !customTokenLoading && onSelectCustomToken && (
          <MenuItem
            onClick={() => {
              onSelectCustomToken(resolvedCustomToken);
              setCustomAddr("");
            }}
            bg="bauhaus.yellow"
            _hover={{ bg: "#e6b31c" }}
            px={3}
            py={2}
            borderBottom="1px solid"
            borderColor="gray.200"
          >
            <HStack spacing={2} w="full">
              <Box
                boxSize="20px"
                borderRadius="full"
                bg="bg.muted"
                border="1px solid"
                borderColor="bauhaus.black"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="7px" fontWeight="800">
                  {resolvedCustomToken.symbol.slice(0, 2)}
                </Text>
              </Box>
              <Box flex={1}>
                <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
                  {resolvedCustomToken.symbol}
                </Text>
                <Text fontSize="xs" color="text.tertiary">
                  {formatBalance(resolvedCustomToken.balance)}
                </Text>
              </Box>
              <Text fontSize="xs" color="text.secondary" fontWeight="700">
                Choose
              </Text>
            </HStack>
          </MenuItem>
        )}

        {/* Existing holdings */}
        {filtered.map((token) => (
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
        {filtered.length === 0 && !resolvedCustomToken && !customTokenLoading && (
          <Box px={3} py={4}>
            <Text fontSize="sm" color="text.tertiary" textAlign="center">
              No tokens{chainName ? ` on ${chainName}` : ""}
            </Text>
          </Box>
        )}
      </MenuList>
    </Menu>
  );
}
