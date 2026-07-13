import { Button, HStack, Text, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { AssetTransferRecord } from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";

export function renderErc20Row(
  t: AssetTransferRecord,
  formatted: string,
  i: number,
  direction: "in" | "out",
  chainId: number,
  explorer: string | undefined,
  formatUsd: (
    amountWei: string,
    decimals: number,
    chainId: number,
    addressOrNative: string | "native",
  ) => string | null,
) {
  const isNegative = direction === "out";
  const sym = t.symbol || `${t.token.slice(0, 6)}…${t.token.slice(-4)}`;
  const cpShort = `${t.counterparty.slice(0, 6)}…${t.counterparty.slice(-4)}`;
  const cpLink = explorer ? `${explorer}/address/${t.counterparty}` : null;
  const usd = formatUsd(t.amountWei, t.decimals ?? 18, chainId, t.token);
  return (
    <HStack
      key={`${direction}-${t.token}-${i}`}
      justify="space-between"
      align="flex-start"
      spacing={2}
      w="full"
      minW={0}
    >
      <HStack spacing={2} minW={0} flex="1">
        <TokenLogo logoUrl={t.logoUrl} symbol={t.symbol} alt={sym} />
        <VStack spacing={0} align="flex-start" minW={0} flex="1">
          <Text
            fontSize="xs"
            fontWeight="800"
            color="text.primary"
            isTruncated
            maxW="120px"
          >
            {sym}
          </Text>
          {cpLink ? (
            <Button
              size="xs"
              variant="ghost"
              fontWeight="600"
              fontSize="2xs"
              fontFamily="mono"
              color="text.tertiary"
              onClick={() => chrome.tabs.create({ url: cpLink })}
              rightIcon={<ExternalLinkIcon boxSize={2.5} />}
              _hover={{ bg: "bg.muted", color: "text.secondary" }}
              px={1.5}
              h="24px"
              minH="24px"
              maxW="full"
            >
              {isNegative ? "to" : "from"} {cpShort}
            </Button>
          ) : (
            <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
              {isNegative ? "to" : "from"} {cpShort}
            </Text>
          )}
        </VStack>
      </HStack>
      <VStack spacing={0} align="flex-end" minW={0} maxW="52%">
        <Text
          fontSize="xs"
          fontWeight="800"
          color={isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
        >
          {formatted} {t.symbol ?? ""}
        </Text>
        {usd && (
          <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
            {usd}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}
