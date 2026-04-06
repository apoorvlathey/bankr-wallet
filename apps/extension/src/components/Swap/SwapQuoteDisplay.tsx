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

function humanizeSource(source: string): string {
  return source.replace(/_/g, " ");
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
  buyTokenPriceUsd?: number;
}

export default function SwapQuoteDisplay({
  quote,
  buyTokenSymbol,
  buyTokenDecimals,
  sellTokenSymbol,
  sellTokenDecimals,
  buyTokenPriceUsd,
}: SwapQuoteDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const minBuyAmount = formatAmount(quote.minBuyAmount, buyTokenDecimals);
  const minBuyUsd = (() => {
    if (!buyTokenPriceUsd || buyTokenPriceUsd <= 0) return null;
    const num = parseFloat(formatUnits(BigInt(quote.minBuyAmount), buyTokenDecimals));
    const usd = num * buyTokenPriceUsd;
    if (usd < 0.01 && usd > 0) return "<$0.01";
    return `~$${usd.toFixed(2)}`;
  })();
  const integratorFee = quote.fees?.integratorFee;
  const zeroExFee = quote.fees?.zeroExFee;

  // Determine if fee is collected in sell or buy token
  const isFeeInBuyToken = integratorFee
    ? integratorFee.token.toLowerCase() === quote.buyToken.toLowerCase()
    : false;
  const feeTokenDecimals = isFeeInBuyToken ? buyTokenDecimals : sellTokenDecimals;
  const feeTokenSymbol = isFeeInBuyToken ? buyTokenSymbol : sellTokenSymbol;
  const feeBaseAmount = isFeeInBuyToken ? quote.buyAmount : quote.sellAmount;

  const walletFeePercent = integratorFee
    ? (
        (parseFloat(integratorFee.amount) / parseFloat(feeBaseAmount)) *
        100
      ).toFixed(1)
    : "0";
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
          borderColor="border.secondary"
        >
          {/* Wallet Fee — always show */}
          <VStack spacing={1} align="stretch">
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
                    color="#B8860B"
                    letterSpacing="0.5px"
                  >
                    ✨ sWCHAN Staker discount
                  </Text>
                )}
              </VStack>
            </HStack>
            {(integratorFee || zeroExFee) && (
              <VStack spacing={0} align="stretch" pl={2}>
                {[
                  integratorFee && { label: "WalletChan", fee: integratorFee },
                  zeroExFee && { label: "0x Protocol", fee: zeroExFee },
                ]
                  .filter(Boolean)
                  .map((item, i, arr) => (
                    <HStack
                      key={item!.label}
                      justify="space-between"
                      position="relative"
                      pl={4}
                      py={0.5}
                    >
                      {/* Vertical line */}
                      <Box
                        position="absolute"
                        left="0"
                        top="0"
                        bottom={i === arr.length - 1 ? "50%" : "0"}
                        w="0"
                        borderLeft="2px solid"
                        borderColor="text.tertiary"
                      />
                      {/* Horizontal branch */}
                      <Box
                        position="absolute"
                        left="0"
                        top="50%"
                        w="10px"
                        h="0"
                        borderTop="2px solid"
                        borderColor="text.tertiary"
                      />
                      <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                        {item!.label}
                      </Text>
                      <Text fontSize="xs" fontWeight="500" color="text.tertiary">
                        {formatAmount(item!.fee.amount, feeTokenDecimals)}{" "}
                        {feeTokenSymbol}
                      </Text>
                    </HStack>
                  ))}
              </VStack>
            )}
          </VStack>

          {/* Route */}
          {uniqueSources.length > 0 && (
            <HStack justify="space-between" align="flex-start" spacing={2}>
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="text.secondary"
                flexShrink={0}
                pt="2px"
              >
                Route
              </Text>
              <VStack spacing={0} align="flex-end">
                {uniqueSources.map((source, i) => (
                  <Box key={i}>
                    {i > 0 && (
                      <Text
                        fontSize="xs"
                        color="text.tertiary"
                        fontWeight="bold"
                        textAlign="center"
                        lineHeight="1.4"
                      >
                        ↓
                      </Text>
                    )}
                    <Box
                      px={1.5}
                      py={0.5}
                      border="2px solid"
                      borderColor="bauhaus.black"
                      fontSize="xs"
                      fontWeight="700"
                      whiteSpace="nowrap"
                    >
                      {humanizeSource(source)}
                    </Box>
                  </Box>
                ))}
              </VStack>
            </HStack>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}
