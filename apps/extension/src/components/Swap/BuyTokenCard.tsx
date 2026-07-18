import {
  Box,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Text,
} from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  NATIVE_TOKEN_ADDRESS,
  type TokenInfo,
} from "@/chrome/swapApi";
import LoadingDots from "@/components/LoadingDots";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatOutputAmount } from "./swapViewUtils";
import { SwapChainTrigger, SwapTokenTrigger } from "./SwapTokenControls";

interface BuyTokenCardProps {
  buyTokenInfo: TokenInfo | null;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  buyChainId: number;
  unifiedBuyAmount?: string;
  quoteLoading: boolean;
  hasQuote: boolean;
  outputUsd: number;
  priceImpact: number | null;
  onOpenChainPicker: () => void;
  onOpenTokenPicker: () => void;
}

export function BuyTokenCard({
  buyTokenInfo,
  buyTokenAddress,
  buyTokenLogoURI,
  buyChainId,
  unifiedBuyAmount,
  quoteLoading,
  hasQuote,
  outputUsd,
  priceImpact,
  onOpenChainPicker,
  onOpenTokenPicker,
}: BuyTokenCardProps) {
  const selectedToken: PortfolioToken | null = buyTokenInfo
    ? {
        contractAddress:
          buyTokenAddress &&
          buyTokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? "native"
            : buyTokenAddress,
        symbol: buyTokenInfo.symbol,
        name: buyTokenInfo.name,
        decimals: buyTokenInfo.decimals,
        logoUrl: buyTokenLogoURI,
        balance: "0",
        balanceFormatted: "0",
        valueUsd: 0,
        priceUsd: 0,
        chainId: buyChainId,
      }
    : null;

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pt={5}
      pb={3}
    >
      <HStack justify="space-between" mb={2} align="center" spacing={1}>
        <HStack minW={0} flex="1 1 auto" spacing={1}>
          <Text fontSize="sm" fontWeight="600" color="fg.secondary" flexShrink={0}>
            You get on
          </Text>
          <SwapChainTrigger chainId={buyChainId} onClick={onOpenChainPicker} />
        </HStack>
        <SwapTokenTrigger token={selectedToken} onClick={onOpenTokenPicker} />
      </HStack>
      <InputGroup position="relative">
        <Input
          placeholder={quoteLoading ? "" : "0.0"}
          value={
            unifiedBuyAmount && buyTokenInfo
              ? formatOutputAmount(unifiedBuyAmount, buyTokenInfo.decimals)
              : ""
          }
          readOnly
          fontFamily="mono"
          fontSize="lg"
          fontWeight="500"
          color="fg.primary"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          bg="surface.sunken"
          minH="54px"
          pr={hasQuote && outputUsd > 0 ? "104px" : undefined}
          _hover={{}}
          _focus={{ boxShadow: "none" }}
          _readOnly={{ color: "fg.primary" }}
          cursor="default"
        />
        {hasQuote && outputUsd > 0 && (
          <InputRightElement h="full" w="96px" pr={3} justifyContent="flex-end">
            <Text
              maxW="84px"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              fontSize="xs"
              color="fg.secondary"
              fontWeight="600"
              title={`~${formatUsd(outputUsd)}`}
            >
              ~{formatUsd(outputUsd)}
            </Text>
          </InputRightElement>
        )}
        {quoteLoading && !unifiedBuyAmount && (
          <Box
            position="absolute"
            left="50%"
            top="50%"
            transform="translate(-50%, -50%)"
            pointerEvents="none"
            zIndex={1}
          >
            <LoadingDots />
          </Box>
        )}
      </InputGroup>

      <HStack mt={1.5} justify="flex-end" align="center" spacing={2} minH="18px">
        {hasQuote && buyTokenInfo && priceImpact !== null && (
          <Text
            minW={0}
            textAlign="right"
            fontSize="xs"
            fontWeight="600"
            noOfLines={1}
            color={
              priceImpact > 10
                ? "chart.negative"
                : priceImpact > 3
                  ? "orange.500"
                  : "fg.muted"
            }
          >
            {priceImpact > 0
              ? `${priceImpact.toFixed(2)}% price impact`
              : `${Math.abs(priceImpact).toFixed(2)}% better than market`}
          </Text>
        )}
      </HStack>
    </Box>
  );
}
