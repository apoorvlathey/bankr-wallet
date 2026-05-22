"use client";

import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { formatUnits } from "viem";
import type { BungeeQuoteResponse, BungeeToken } from "@walletchan/shared/bungee";

interface BridgeQuoteDisplayProps {
  quote: BungeeQuoteResponse;
  outputToken: BungeeToken;
}

function formatAmount(
  amount: string,
  decimals: number,
  displayDecimals = 6,
): string {
  try {
    const formatted = formatUnits(BigInt(amount), decimals);
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    if (num < 0.000001) return "< 0.000001";
    return num.toFixed(displayDecimals).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

function formatEta(seconds?: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function BridgeQuoteDisplay({
  quote,
  outputToken,
}: BridgeQuoteDisplayProps) {
  const route = quote.result.manualRoutes[0];
  if (!route) return null;

  const decimals = outputToken.decimals ?? 18;
  const symbol = outputToken.symbol ?? "TOKEN";
  const buyAmount = formatAmount(route.output.amount, decimals);
  const minBuyAmount = formatAmount(
    route.output.minAmountOut ?? route.output.amount,
    decimals,
  );
  const routeName = route.routeDetails?.name ?? "Bungee";
  const gasUsd = route.gasFee?.feesInUsd;
  const eta = formatEta(route.estimatedTime);

  return (
    <Box
      bg="bauhaus.muted"
      border="2px solid"
      borderColor="bauhaus.border"
      px={4}
      py={3}
    >
      <VStack spacing={2} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="2xs" fontWeight="bold" color="gray.500" textTransform="uppercase" letterSpacing="wider">
            You receive
          </Text>
          <Text fontWeight="black" fontSize="lg">
            {buyAmount} {symbol}
          </Text>
        </HStack>
        <HStack justify="space-between" fontSize="xs">
          <Text color="gray.500" fontWeight="bold">
            Min received
          </Text>
          <Text fontWeight="bold">
            {minBuyAmount} {symbol}
          </Text>
        </HStack>
        <HStack justify="space-between" fontSize="xs">
          <Text color="gray.500" fontWeight="bold">
            Route
          </Text>
          <Text fontWeight="bold">{routeName}</Text>
        </HStack>
        <HStack justify="space-between" fontSize="xs">
          <Text color="gray.500" fontWeight="bold">
            Est. time
          </Text>
          <Text fontWeight="bold">{eta}</Text>
        </HStack>
        {gasUsd !== undefined && (
          <HStack justify="space-between" fontSize="xs">
            <Text color="gray.500" fontWeight="bold">
              Gas (est.)
            </Text>
            <Text fontWeight="bold">${gasUsd.toFixed(2)}</Text>
          </HStack>
        )}
        {quote.feeBps && (
          <HStack justify="space-between" fontSize="xs">
            <Text color="gray.500" fontWeight="bold">
              Integrator fee
            </Text>
            <HStack spacing={1}>
              <Text fontWeight="bold">
                {(parseInt(quote.feeBps, 10) / 100).toFixed(2)}%
              </Text>
              {quote.isPremiumFee && (
                <Box
                  bg="bauhaus.yellow"
                  border="1px solid"
                  borderColor="bauhaus.black"
                  px={1}
                  fontSize="2xs"
                  fontWeight="black"
                  textTransform="uppercase"
                >
                  Premium
                </Box>
              )}
            </HStack>
          </HStack>
        )}
      </VStack>
    </Box>
  );
}
