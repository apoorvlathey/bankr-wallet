import { Button, Box, HStack, Text, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";
import type { AssetTransferRecord } from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";
import { TokenContractPopover } from "@/components/shared/TokenContractPopover";
import { appendTokenSymbol } from "@/lib/tokenAmountFormat";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

export function Erc20TokenIdentity({
  token,
  logoUrl,
  symbol,
  explorer,
  meta,
}: {
  token: string;
  logoUrl?: string;
  symbol?: string;
  explorer?: string;
  meta?: ReactNode;
}) {
  const displaySymbol = symbol || `${token.slice(0, 6)}…${token.slice(-4)}`;
  const logo = (
    <TokenLogo
      logoUrl={logoUrl}
      symbol={symbol}
      alt={displaySymbol}
      size="28px"
      fontSize="8px"
    />
  );
  const symbolText = (
    <Text
      fontSize="sm"
      fontWeight="700"
      color="inherit"
      noOfLines={1}
      maxW="120px"
    >
      {displaySymbol}
    </Text>
  );
  const symbolWithContract = /^0x[a-fA-F0-9]{40}$/.test(token) ? (
    <TokenContractPopover
      address={token}
      explorer={explorer}
      symbol={symbol || "token"}
      triggerColor="fg.primary"
    >
      {symbolText}
    </TokenContractPopover>
  ) : (
    symbolText
  );

  return (
    <HStack spacing={2.5} minW={0} color="fg.primary" align="center">
      {logo}
      <VStack spacing={0} minW={0} align="stretch">
        {symbolWithContract}
        {meta}
      </VStack>
    </HStack>
  );
}

export default function Erc20TransferRow({
  transfer,
  formatted,
  direction,
  chainId,
  explorer,
  formatUsd,
}: {
  transfer: AssetTransferRecord;
  formatted: string;
  direction: "in" | "out";
  chainId: number;
  explorer?: string;
  formatUsd: FormatUsd;
}) {
  const isNegative = direction === "out";
  const cpShort = `${transfer.counterparty.slice(0, 6)}…${transfer.counterparty.slice(-4)}`;
  const cpLink = explorer ? `${explorer}/address/${transfer.counterparty}` : null;
  const usd = formatUsd(
    transfer.amountWei,
    transfer.decimals ?? 18,
    chainId,
    transfer.token,
  );

  return (
    <HStack
      justify="space-between"
      align="flex-start"
      spacing={3}
      w="full"
      minW={0}
      py={2}
    >
      <Box minW={0} flex="1">
        <Erc20TokenIdentity
          token={transfer.token}
          logoUrl={transfer.logoUrl}
          symbol={transfer.symbol}
          explorer={explorer}
          meta={
            cpLink ? (
              <Button
                size="xs"
                variant="ghost"
                justifyContent="flex-start"
                fontWeight="600"
                fontSize="2xs"
                fontFamily="mono"
                color="text.tertiary"
                onClick={() => chrome.tabs.create({ url: cpLink })}
                rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                _hover={{ bg: "transparent", color: "text.secondary" }}
                px={0}
                h="24px"
                minH="24px"
                minW={0}
                maxW="full"
              >
                {isNegative ? "to" : "from"} {cpShort}
              </Button>
            ) : (
              <Text
                fontSize="2xs"
                fontFamily="mono"
                color="text.tertiary"
                noOfLines={1}
              >
                {isNegative ? "to" : "from"} {cpShort}
              </Text>
            )
          }
        />
      </Box>
      <VStack spacing={0} align="flex-end" minW={0} maxW="52%">
        <Text
          fontSize="sm"
          fontWeight="700"
          color={isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
        >
          {appendTokenSymbol(formatted, transfer.symbol ?? "")}
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
