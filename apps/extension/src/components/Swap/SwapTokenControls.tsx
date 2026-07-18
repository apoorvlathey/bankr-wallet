import type React from "react";
import {
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
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
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

function useSwapChainName(chainId: number): string {
  const { networksInfo } = useNetworks();
  return (
    getResolvedChainById(chainId, networksInfo)?.name ??
    getChainConfig(chainId).name
  );
}

export function SwapChainTrigger({
  chainId,
  onClick,
}: {
  chainId: number;
  onClick: () => void;
}) {
  const chainName = useSwapChainName(chainId);

  return (
    <HStack
      as="button"
      cursor="pointer"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      bg="surface.sunken"
      px={2}
      py={1.5}
      spacing={1}
      _hover={{ borderColor: "border.focus", bg: "surface.raisedHover" }}
      onClick={onClick}
      minW="80px"
      maxW="full"
      minH="38px"
      flex="0 1 auto"
      textAlign="left"
    >
      <ChainIcon chainId={chainId} chainName={chainName} size="18px" withChip />
      <Text minW={0} flex={1} fontWeight="700" fontSize="xs" noOfLines={1}>
        {chainName}
      </Text>
      <ChevronDownIcon flexShrink={0} color="fg.secondary" />
    </HStack>
  );
}

export function SwapTokenTrigger({
  token,
  onClick,
}: {
  token: PortfolioToken | null;
  onClick: () => void;
}) {
  return (
    <HStack
      as="button"
      cursor="pointer"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      bg="surface.sunken"
      px={2}
      py={1.5}
      spacing={1}
      _hover={{ borderColor: "border.focus", bg: "surface.raisedHover" }}
      onClick={onClick}
      minW="98px"
      maxW="132px"
      minH="38px"
      flexShrink={0}
      textAlign="left"
    >
      {token &&
        (token.logoUrl ? (
          <SafeImage
            src={token.logoUrl}
            alt={token.symbol}
            boxSize="22px"
            borderRadius="full"
            fallback={<TokenSymbolFallback symbol={token.symbol} size="22px" />}
          />
        ) : (
          <TokenSymbolFallback symbol={token.symbol} size="22px" />
        ))}
      <Text
        minW={0}
        flex={1}
        fontWeight="700"
        fontSize="sm"
        textTransform="uppercase"
        noOfLines={1}
      >
        {token?.symbol || "Select"}
      </Text>
      <ChevronDownIcon flexShrink={0} color="fg.secondary" />
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
