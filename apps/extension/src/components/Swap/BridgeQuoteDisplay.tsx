import { useState } from "react";
import { Box, HStack, Text, VStack, Icon, Collapse } from "@chakra-ui/react";
import { formatUnits } from "viem";
import type { BungeeQuoteResponse } from "@walletchan/shared/bungee";
import { getExecutableBridgeRoute } from "./bridgeRouteUtils";

function ChevronIcon({
  isOpen,
  ...props
}: { isOpen: boolean } & React.ComponentProps<typeof Icon>) {
  return (
    <Icon
      viewBox="0 0 24 24"
      transform={isOpen ? "rotate(180deg)" : undefined}
      transition="transform 0.2s"
      {...props}
    >
      <path
        fill="currentColor"
        d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"
      />
    </Icon>
  );
}

function formatAmount(amount: string, decimals: number): string {
  try {
    const formatted = formatUnits(BigInt(amount), decimals);
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    if (num < 0.000001) return "< 0.000001";
    return num.toFixed(6).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

interface BridgeQuoteDisplayProps {
  quote: BungeeQuoteResponse;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  buyTokenPriceUsd?: number;
  /** User-selected slippage in bps (100 = 1%). Used ONLY when Socket omits
   *  `output.minAmountOut` — when present we trust whatever Bungee returns. */
  slippageBps: number;
  /** Source chain native symbol (e.g., "ETH") used to label the bridge
   *  protocol fee paid as msg.value with the source tx. */
  sourceNativeSymbol?: string;
  /** Source chain native USD price — when available, render the protocol
   *  fee with a dollar equivalent so users understand the cost. */
  sourceNativePriceUsd?: number;
}

export default function BridgeQuoteDisplay({
  quote,
  buyTokenSymbol,
  buyTokenDecimals,
  buyTokenPriceUsd,
  slippageBps,
  sourceNativeSymbol,
  sourceNativePriceUsd,
}: BridgeQuoteDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const route = getExecutableBridgeRoute(quote);
  if (!route) return null;

  // Trust Socket's `output.minAmountOut` when present. Only when it's truly
  // omitted do we fall back to deriving the floor locally from the user-
  // selected slippage so the UI doesn't restate the expected amount.
  const amountWei = route.output.amount;
  const apiMin = route.output.minAmountOut;
  const minBuyAmountWei = (() => {
    if (apiMin) return apiMin;
    try {
      const derived =
        (BigInt(amountWei) * BigInt(10_000 - slippageBps)) / 10_000n;
      return derived.toString();
    } catch {
      return amountWei;
    }
  })();
  const minBuyAmount = formatAmount(minBuyAmountWei, buyTokenDecimals);
  const minBuyUsd = (() => {
    if (!buyTokenPriceUsd || buyTokenPriceUsd <= 0) return null;
    try {
      const num = parseFloat(formatUnits(BigInt(minBuyAmountWei), buyTokenDecimals));
      const usd = num * buyTokenPriceUsd;
      if (usd < 0.01 && usd > 0) return "<$0.01";
      return `~$${usd.toFixed(2)}`;
    } catch {
      return null;
    }
  })();

  const routeName = route.routeDetails?.name ?? "Bungee";
  const gasUsd = route.gasFee
    ? "feesInUsd" in route.gasFee
      ? route.gasFee.feesInUsd
      : route.gasFee.feeInUsd
    : undefined;
  const walletFeePercent = quote.feeBps
    ? (parseInt(quote.feeBps, 10) / 100).toFixed(2)
    : null;

  // Bridge protocol fee = msg.value on the source tx. For LayerZero / Stargate
  // routes this funds destination-chain message delivery and is paid in the
  // source chain's native token. Socket returns it under `txData.value`.
  const protocolFeeWei = (() => {
    const raw = route.txData?.value;
    if (!raw) return 0n;
    try {
      const v = BigInt(raw);
      return v > 0n ? v : 0n;
    } catch {
      return 0n;
    }
  })();
  const protocolFeeNative =
    protocolFeeWei > 0n ? formatUnits(protocolFeeWei, 18) : null;
  const protocolFeeUsd = (() => {
    if (!protocolFeeNative || !sourceNativePriceUsd || sourceNativePriceUsd <= 0)
      return null;
    const usd = parseFloat(protocolFeeNative) * sourceNativePriceUsd;
    if (usd <= 0) return null;
    if (usd < 0.01) return "<$0.01";
    return `$${usd.toFixed(2)}`;
  })();
  const protocolFeeDisplay = (() => {
    if (!protocolFeeNative) return null;
    const num = parseFloat(protocolFeeNative);
    if (num === 0) return null;
    const trimmed = num.toFixed(6).replace(/\.?0+$/, "");
    return `${trimmed} ${sourceNativeSymbol ?? "ETH"}`;
  })();

  return (
    <Box
      bg="surface.sunken"
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      py={2}
    >
      <HStack
        as="button"
        justify="space-between"
        w="full"
        onClick={() => setIsOpen((v) => !v)}
        cursor="pointer"
      >
        <Text
          fontSize="xs"
          fontWeight="bold"
          textTransform="uppercase"
          color="text.secondary"
        >
          Min. Received
        </Text>
        <HStack spacing={1} align="center">
          <VStack spacing={0} align="flex-end">
            <Text fontSize="sm" fontWeight="700" noOfLines={1}>
              {minBuyAmount} {buyTokenSymbol}
            </Text>
            {minBuyUsd && (
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                {minBuyUsd}
              </Text>
            )}
          </VStack>
          <ChevronIcon isOpen={isOpen} boxSize={4} color="text.tertiary" />
        </HStack>
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <VStack
          spacing={2}
          align="stretch"
          mt={2}
          pt={2}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          {walletFeePercent !== null && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                Wallet Fee
              </Text>
              <VStack spacing={0} align="flex-end">
                <Text fontSize="sm" fontWeight="500">
                  {walletFeePercent}%
                </Text>
                {quote.isPremiumFee && (
                  <Text
                    fontSize="9px"
                    fontWeight="800"
                    textTransform="uppercase"
                    color="chart.numeric"
                    letterSpacing="0.5px"
                  >
                    ✨ sWCHAN Staker discount applied
                  </Text>
                )}
              </VStack>
            </HStack>
          )}

          <HStack justify="space-between">
            <Text
              fontSize="xs"
              fontWeight="bold"
              textTransform="uppercase"
              color="text.secondary"
            >
              Route
            </Text>
            <Box
              px={1.5}
              py={0.5}
              border="2px solid"
              borderColor="border.default"
              borderRadius="md"
              fontSize="xs"
              fontWeight="700"
              whiteSpace="nowrap"
            >
              {routeName}
            </Box>
          </HStack>

          {protocolFeeDisplay && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                Bridge Fee
              </Text>
              <VStack spacing={0} align="flex-end">
                <Text fontSize="xs" fontWeight="700">
                  {protocolFeeDisplay}
                </Text>
                {protocolFeeUsd && (
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                    {protocolFeeUsd}
                  </Text>
                )}
              </VStack>
            </HStack>
          )}

          {gasUsd !== undefined && gasUsd > 0 && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                Gas (est.)
              </Text>
              <Text fontSize="xs" fontWeight="700">
                ${gasUsd.toFixed(2)}
              </Text>
            </HStack>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}
