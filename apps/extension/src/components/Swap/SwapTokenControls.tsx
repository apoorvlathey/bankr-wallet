import type React from "react";
import {
  Box,
  HStack,
  Icon,
  IconButton,
  Text,
} from "@chakra-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import { TokenSymbolFallback } from "./TokenSymbolFallback";

export function SwapArrowIcon(props: React.ComponentProps<typeof Icon>) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"
      />
    </Icon>
  );
}

export function TokenChainTrigger({
  token,
  chainId,
  onClick,
}: {
  token: PortfolioToken | null;
  chainId: number;
  onClick: () => void;
}) {
  return (
    <HStack
      as="button"
      cursor="pointer"
      border="2px solid"
      borderColor="border.default"
      borderRadius="md"
      bg="surface.base"
      px={2}
      py={1.5}
      spacing={2}
      _hover={{ borderColor: "accent.secondary" }}
      onClick={onClick}
      minW="100px"
    >
      {token && (
        <Box position="relative" boxSize="22px" flexShrink={0}>
          {token.logoUrl ? (
            <SafeImage
              src={token.logoUrl}
              alt={token.symbol}
              boxSize="22px"
              borderRadius="full"
              fallback={
                <TokenSymbolFallback symbol={token.symbol} size="22px" />
              }
            />
          ) : (
            <TokenSymbolFallback symbol={token.symbol} size="22px" />
          )}
          <Box
            position="absolute"
            right="-3px"
            bottom="-3px"
            bg="surface.base"
            borderRadius="full"
            p="1px"
          >
            <ChainIcon chainId={chainId} size="10px" withChip />
          </Box>
        </Box>
      )}
      <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
        {token?.symbol || "Select"}
      </Text>
      <ChevronDownIcon />
    </HStack>
  );
}

export function TokenAddressRow({
  address,
  explorer,
  copied,
  onCopy,
}: {
  address: string;
  explorer: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <HStack spacing={1}>
      <Text fontSize="2xs" color="text.tertiary" fontFamily="mono">
        {address.slice(0, 6)}...{address.slice(-4)}
      </Text>
      <IconButton
        aria-label="Copy address"
        icon={
          copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />
        }
        size="xs"
        variant="ghost"
        minW="18px"
        h="18px"
        color={copied ? "accent.highlight" : "text.tertiary"}
        onClick={onCopy}
        _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
      />
      {explorer && (
        <IconButton
          aria-label="View on explorer"
          icon={<ExternalLinkIcon boxSize="10px" />}
          size="xs"
          variant="ghost"
          minW="18px"
          h="18px"
          color="text.tertiary"
          onClick={() =>
            chrome.tabs.create({ url: `${explorer}/token/${address}` })
          }
          _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
        />
      )}
    </HStack>
  );
}
