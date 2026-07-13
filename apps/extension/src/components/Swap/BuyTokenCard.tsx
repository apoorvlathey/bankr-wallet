import { Box, HStack, Input, InputGroup, Text } from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  NATIVE_TOKEN_ADDRESS,
  type TokenInfo,
} from "@/chrome/swapApi";
import LoadingDots from "@/components/LoadingDots";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatOutputAmount } from "./swapViewUtils";
import { TokenAddressRow, TokenChainTrigger } from "./SwapTokenControls";

interface BuyTokenCardProps {
  buyTokenInfo: TokenInfo | null;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  buyChainId: number;
  explorer: string;
  unifiedBuyAmount?: string;
  quoteLoading: boolean;
  hasQuote: boolean;
  outputUsd: number;
  priceImpact: number | null;
  copied: boolean;
  onOpenPicker: () => void;
  onCopy: () => void;
}

export function BuyTokenCard({
  buyTokenInfo,
  buyTokenAddress,
  buyTokenLogoURI,
  buyChainId,
  explorer,
  unifiedBuyAmount,
  quoteLoading,
  hasQuote,
  outputUsd,
  priceImpact,
  copied,
  onOpenPicker,
  onCopy,
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
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      p={3}
    >
      <Text fontSize="xs" fontWeight="600" color="fg.secondary" mb={2}>
        You receive
      </Text>
      <HStack spacing={2} position="relative">
        <TokenChainTrigger
          token={selectedToken}
          chainId={buyChainId}
          onClick={onOpenPicker}
        />
        <InputGroup flex={1} position="relative">
          <Input
            placeholder={quoteLoading ? "" : "0.0"}
            value={
              unifiedBuyAmount && buyTokenInfo
                ? formatOutputAmount(
                    unifiedBuyAmount,
                    buyTokenInfo.decimals,
                  )
                : ""
            }
            readOnly
            fontFamily="mono"
            fontSize="sm"
            border="2px solid"
            borderColor="border.default"
            bg="surface.sunken"
            _hover={{}}
            _focus={{ boxShadow: "none" }}
            cursor="default"
          />
          {quoteLoading && !unifiedBuyAmount && (
            <Box
              position="absolute"
              left="14px"
              top="50%"
              transform="translateY(-50%)"
              pointerEvents="none"
              zIndex={1}
            >
              <LoadingDots />
            </Box>
          )}
        </InputGroup>
      </HStack>

      {(buyTokenInfo || (hasQuote && (outputUsd > 0 || priceImpact !== null))) && (
        <HStack align="center" spacing={2} mt={1}>
          {buyTokenAddress &&
            buyTokenInfo &&
            buyTokenAddress.toLowerCase() !==
              NATIVE_TOKEN_ADDRESS.toLowerCase() && (
              <TokenAddressRow
                address={buyTokenAddress}
                explorer={explorer}
                copied={copied}
                onCopy={onCopy}
              />
            )}
          {hasQuote &&
            buyTokenInfo &&
            (outputUsd > 0 || priceImpact !== null) && (
              <HStack
                ml="auto"
                spacing={1}
                align="baseline"
                whiteSpace="nowrap"
              >
                {outputUsd > 0 && (
                  <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                    ~{formatUsd(outputUsd)}
                  </Text>
                )}
                {priceImpact !== null && (
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color={
                      priceImpact > 10
                        ? "chart.negative"
                        : priceImpact > 3
                          ? "orange.500"
                          : "text.tertiary"
                    }
                  >
                    {priceImpact > 0
                      ? `(-${priceImpact.toFixed(2)}%)`
                      : `(+${Math.abs(priceImpact).toFixed(2)}%)`}
                  </Text>
                )}
              </HStack>
            )}
        </HStack>
      )}
    </Box>
  );
}
