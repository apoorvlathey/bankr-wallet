import { Box, HStack, Text } from "@chakra-ui/react";
import { TimeIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  NATIVE_TOKEN_ADDRESS,
  type SwapQuoteResponse,
  type TokenInfo,
} from "@/chrome/swapApi";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import type { BungeeQuoteResponse } from "@walletchan/shared/bungee";
import BridgeQuoteDisplay from "./BridgeQuoteDisplay";
import SlippageSettings from "./SlippageSettings";
import SwapQuoteDisplay from "./SwapQuoteDisplay";
import { getExecutableBridgeRoute } from "./bridgeRouteUtils";
import type {
  DestinationNativeInfo,
  SwapAccountType,
} from "./swapViewTypes";

interface SwapQuoteSectionProps {
  quote: SwapQuoteResponse | null;
  bridgeQuote: BungeeQuoteResponse | null;
  quoteError: string | null;
  quoteLoading: boolean;
  isBridge: boolean;
  sellToken: PortfolioToken | null;
  buyTokenInfo: TokenInfo | null;
  buyTokenAddress: string;
  buyTokenPriceUsd: number;
  buyChainId: number;
  destNativeInfo: DestinationNativeInfo | null;
  slippageBps: number;
  sourceNativeSymbol: string;
  sourceNativePriceUsd?: number;
  priceImpact: number | null;
  accountType: SwapAccountType;
  onUseDestinationNative: () => void;
  onSlippageChange: (value: number) => void;
}

export function SwapQuoteSection({
  quote,
  bridgeQuote,
  quoteError,
  quoteLoading,
  isBridge,
  sellToken,
  buyTokenInfo,
  buyTokenAddress,
  buyTokenPriceUsd,
  buyChainId,
  destNativeInfo,
  slippageBps,
  sourceNativeSymbol,
  sourceNativePriceUsd,
  priceImpact,
  accountType,
  onUseDestinationNative,
  onSlippageChange,
}: SwapQuoteSectionProps) {
  const bridgeRoute = getExecutableBridgeRoute(bridgeQuote);
  const routeName = bridgeRoute?.routeDetails?.name ?? "Best route";
  const estimatedTime = bridgeRoute?.estimatedTime
    ? bridgeRoute.estimatedTime < 60
      ? `${bridgeRoute.estimatedTime}s`
      : `${Math.round(bridgeRoute.estimatedTime / 60)} min`
    : null;

  return (
    <>
      {quoteError && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700">
          {quoteError}
        </Text>
      )}

      {isBridge &&
        quoteError &&
        !quoteLoading &&
        sellToken &&
        destNativeInfo?.symbol &&
        buyTokenAddress.toLowerCase() !==
          NATIVE_TOKEN_ADDRESS.toLowerCase() && (
          <HStack
            as="button"
            onClick={onUseDestinationNative}
            px={3}
            py={2}
            border="1px solid"
            borderColor="border.default"
            borderRadius="md"
            bg="surface.raised"
            spacing={2}
            cursor="pointer"
            _hover={{ borderColor: "border.focus" }}
          >
            <Box position="relative" boxSize="20px" flexShrink={0}>
              {destNativeInfo.logoUrl ? (
                <SafeImage
                  src={destNativeInfo.logoUrl}
                  alt={destNativeInfo.symbol}
                  boxSize="20px"
                  borderRadius="full"
                />
              ) : (
                <Box boxSize="20px" borderRadius="full" bg="surface.sunken" />
              )}
              <Box position="absolute" right="-3px" bottom="-3px">
                <ChainIcon
                  chainId={buyChainId}
                  chainName={destNativeInfo.chainName}
                  size="10px"
                  withChip
                />
              </Box>
            </Box>
            <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
              Swap to {destNativeInfo.symbol.toUpperCase()} on{" "}
              {destNativeInfo.chainName} instead?
            </Text>
          </HStack>
        )}

      <HStack justify="space-between" minH="32px" spacing={2}>
        {quoteLoading ? (
          <Text fontSize="xs" color="fg.muted" fontWeight="600">
            Finding the best route…
          </Text>
        ) : isBridge && bridgeRoute ? (
          <HStack spacing={1.5} color="fg.secondary" minW={0}>
            <TimeIcon boxSize={3} />
            <Text fontSize="xs" fontWeight="600" noOfLines={1}>
              {routeName}{estimatedTime ? ` · ~${estimatedTime}` : ""}
            </Text>
          </HStack>
        ) : quote ? (
          <Text fontSize="xs" color="fg.secondary" fontWeight="600">
            Best available route
          </Text>
        ) : (
          <Box />
        )}
        <SlippageSettings
          slippageBps={slippageBps}
          onSlippageChange={onSlippageChange}
        />
      </HStack>

      {quote && buyTokenInfo && sellToken && !isBridge && (
        <SwapQuoteDisplay
          quote={quote}
          buyTokenSymbol={buyTokenInfo.symbol}
          buyTokenDecimals={buyTokenInfo.decimals}
          sellTokenSymbol={sellToken.symbol}
          sellTokenDecimals={
            sellToken.contractAddress === "native" ? 18 : sellToken.decimals
          }
          buyTokenPriceUsd={buyTokenPriceUsd}
        />
      )}
      {bridgeQuote && buyTokenInfo && isBridge && (
        <BridgeQuoteDisplay
          quote={bridgeQuote}
          buyTokenSymbol={buyTokenInfo.symbol}
          buyTokenDecimals={buyTokenInfo.decimals}
          buyTokenPriceUsd={buyTokenPriceUsd}
          slippageBps={slippageBps}
          sourceNativeSymbol={sourceNativeSymbol}
          sourceNativePriceUsd={sourceNativePriceUsd}
        />
      )}

      {priceImpact !== null && priceImpact > 3 && (
        <Box
          bg={priceImpact > 10 ? "status.error.bg" : "status.warning.bg"}
          color={priceImpact > 10 ? "status.error.fg" : "status.warning.fg"}
          border="1px solid"
          borderColor={
            priceImpact > 10 ? "status.error.border" : "status.warning.border"
          }
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="sm" fontWeight="700">
            {priceImpact > 10
              ? `High price impact (~${priceImpact.toFixed(1)}%). You may receive significantly fewer tokens.`
              : `Price impact is ~${priceImpact.toFixed(1)}%.`}
          </Text>
        </Box>
      )}

      {accountType === "impersonator" && (
        <Box
          bg="status.warning.bg"
          color="status.warning.fg"
          border="1px solid"
          borderColor="status.warning.border"
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="sm" fontWeight="700">
            View-only account — swaps are disabled.
          </Text>
        </Box>
      )}
      {accountType === "ledger" && (
        <Box
          bg="status.info.bg"
          color="status.info.fg"
          border="1px solid"
          borderColor="status.info.border"
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="sm" fontWeight="600">
            WalletChan&apos;s built-in swap does not yet support Ledger. Use a
            swap dapp and approve it through the normal Ledger confirmation.
          </Text>
        </Box>
      )}
    </>
  );
}
