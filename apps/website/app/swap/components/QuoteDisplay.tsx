"use client";

import { useState } from "react";
import { Box, HStack, Text, VStack, Icon, Collapse } from "@chakra-ui/react";
import { formatTokenAmount, type SwapQuote } from "../hooks/useSwapQuote";

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

interface QuoteDisplayProps {
  quote: SwapQuote;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
}

export function QuoteDisplay({
  quote,
  buyTokenSymbol,
  buyTokenDecimals,
  sellTokenSymbol,
  sellTokenDecimals,
}: QuoteDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const minBuyAmount = formatTokenAmount(quote.minBuyAmount, buyTokenDecimals);

  const integratorFee = quote.fees?.integratorFee;
  const zeroExFee = quote.fees?.zeroExFee;
  const feePercent = integratorFee
    ? (
        (parseFloat(integratorFee.amount) / parseFloat(quote.sellAmount)) *
        100
      ).toFixed(1)
    : "0";

  // Determine route sources
  const sources = quote.route?.fills?.map((f) => f.source) ?? [];
  const uniqueSources = [...new Set(sources)];

  return (
    <Box
      bg="bauhaus.muted"
      border="2px solid"
      borderColor="bauhaus.border"
      px={4}
      py={3}
    >
      {/* Always-visible header row */}
      <HStack
        as="button"
        justify="space-between"
        w="full"
        onClick={() => setIsOpen((v) => !v)}
        cursor="pointer"
      >
        <HStack spacing={2}>
          <Text fontSize="xs" fontWeight="bold" textTransform="uppercase">
            Min. Received
          </Text>
        </HStack>
        <HStack spacing={1}>
          <Text fontSize="sm" fontWeight="medium">
            {minBuyAmount} {buyTokenSymbol}
          </Text>
          <ChevronIcon isOpen={isOpen} boxSize={4} color="gray.500" />
        </HStack>
      </HStack>

      {/* Collapsible details */}
      <Collapse in={isOpen} animateOpacity>
        <VStack
          spacing={2}
          align="stretch"
          mt={3}
          pt={3}
          borderTop="1px solid"
          borderColor="gray.300"
        >
          {integratorFee && (
            <HStack justify="space-between">
              <Text fontSize="xs" fontWeight="bold" textTransform="uppercase">
                $WCHAN Fee ({feePercent}%)
              </Text>
              <Text fontSize="sm" fontWeight="medium">
                {formatTokenAmount(integratorFee.amount, sellTokenDecimals)}{" "}
                {sellTokenSymbol}
              </Text>
            </HStack>
          )}

          {zeroExFee && (
            <HStack justify="space-between">
              <Text fontSize="xs" fontWeight="bold" textTransform="uppercase">
                0x Fee
              </Text>
              <Text fontSize="sm" fontWeight="medium">
                {formatTokenAmount(zeroExFee.amount, sellTokenDecimals)}{" "}
                {sellTokenSymbol}
              </Text>
            </HStack>
          )}

          {uniqueSources.length > 0 && (
            <HStack justify="space-between">
              <Text fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Route
              </Text>
              <Text fontSize="sm" fontWeight="medium">
                {uniqueSources.join(" + ")}
              </Text>
            </HStack>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}
