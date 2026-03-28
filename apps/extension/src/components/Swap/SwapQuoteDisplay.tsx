import { useState } from "react";
import { Box, HStack, Text, VStack, Icon, Collapse } from "@chakra-ui/react";
import { formatUnits } from "viem";
import type { SwapQuoteResponse } from "@/chrome/swapApi";

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
  const formatted = formatUnits(BigInt(amount), decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  return num.toFixed(6).replace(/\.?0+$/, "");
}

interface SwapQuoteDisplayProps {
  quote: SwapQuoteResponse;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
}

export default function SwapQuoteDisplay({
  quote,
  buyTokenSymbol,
  buyTokenDecimals,
  sellTokenSymbol,
  sellTokenDecimals,
}: SwapQuoteDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const minBuyAmount = formatAmount(quote.minBuyAmount, buyTokenDecimals);
  const integratorFee = quote.fees?.integratorFee;
  const zeroExFee = quote.fees?.zeroExFee;
  const sources = quote.route?.fills?.map((f) => f.source) ?? [];
  const uniqueSources = [...new Set(sources)];

  return (
    <Box
      bg="bg.muted"
      border="3px solid"
      borderColor="bauhaus.black"
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
        <HStack spacing={1}>
          <Text fontSize="sm" fontWeight="700">
            {minBuyAmount} {buyTokenSymbol}
          </Text>
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
          borderColor="border.secondary"
        >
          {integratorFee && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                Fee (0.9%)
              </Text>
              <Text fontSize="sm" fontWeight="500">
                {formatAmount(integratorFee.amount, sellTokenDecimals)}{" "}
                {sellTokenSymbol}
              </Text>
            </HStack>
          )}

          {zeroExFee && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                0x Fee
              </Text>
              <Text fontSize="sm" fontWeight="500">
                {formatAmount(zeroExFee.amount, sellTokenDecimals)}{" "}
                {sellTokenSymbol}
              </Text>
            </HStack>
          )}

          {uniqueSources.length > 0 && (
            <HStack justify="space-between">
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
              >
                Route
              </Text>
              <Text fontSize="sm" fontWeight="500">
                {uniqueSources.join(" + ")}
              </Text>
            </HStack>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}
