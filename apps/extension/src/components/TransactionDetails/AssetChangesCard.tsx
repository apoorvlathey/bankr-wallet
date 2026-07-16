import { Box, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { ArrowDownIcon, ArrowUpIcon } from "@chakra-ui/icons";
import type { AssetChangeRecord } from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";
import { getChainConfig } from "@/constants/chainConfig";
import { appendTokenSymbol } from "@/lib/tokenAmountFormat";
import Erc20TransferGroupRow from "./Erc20TransferGroupRow";
import {
  formatSignedTokenAmount,
  getErc20TransferGroups,
} from "./formatting";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

function DirectionHeader({ direction }: { direction: "send" | "receive" }) {
  const isSend = direction === "send";
  const color = isSend ? "chart.negative" : "chart.positive";
  const ArrowIcon = isSend ? ArrowUpIcon : ArrowDownIcon;
  return (
    <HStack spacing={1.5} pt={2.5} pb={0.5}>
      <Flex
        boxSize="18px"
        flexShrink={0}
        align="center"
        justify="center"
        borderRadius="full"
        bg={color}
        color="surface.base"
      >
        <ArrowIcon boxSize="10px" transform="rotate(45deg)" aria-hidden />
      </Flex>
      <Text color={color} fontSize="xs" fontWeight="700" textTransform="uppercase">
        {direction}
      </Text>
    </HStack>
  );
}

export default function AssetChangesCard({
  record,
  chainId,
  nativeSym,
  label,
  formatUsd,
}: {
  record: AssetChangeRecord;
  chainId: number;
  nativeSym: string;
  label?: string;
  formatUsd: FormatUsd;
}) {
  const explorer = getChainConfig(chainId).explorer;
  const nativeData = (() => {
    if (!record.nativeDelta) return null;
    let value: bigint;
    try {
      value = BigInt(record.nativeDelta);
    } catch {
      return null;
    }
    if (value === 0n) return null;
    const isNegative = value < 0n;
    const formatted = formatSignedTokenAmount(record.nativeDelta, 18, isNegative);
    if (formatted === null) return null;
    return {
      isNegative,
      formatted,
      usd: formatUsd(record.nativeDelta, 18, chainId, "native"),
    };
  })();

  const nativeRow = nativeData ? (
    <HStack justify="space-between" align="flex-start" spacing={3} minW={0} py={2}>
      <HStack spacing={2.5} minW={0} flex="1">
        <TokenLogo
          nativeChainId={chainId}
          symbol={nativeSym}
          alt={nativeSym}
          size="28px"
          fontSize="8px"
        />
        <Text fontSize="sm" fontWeight="700" color="text.primary">
          {nativeSym}
        </Text>
      </HStack>
      <VStack spacing={0} align="flex-end" minW={0} maxW="58%">
        <Text
          fontSize="sm"
          fontWeight="700"
          color={nativeData.isNegative ? "chart.negative" : "chart.positive"}
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
        >
          {appendTokenSymbol(nativeData.formatted, nativeSym)}
        </Text>
        {nativeData.usd && (
          <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
            {nativeData.usd}
          </Text>
        )}
      </VStack>
    </HStack>
  ) : null;

  const outGroups = getErc20TransferGroups(record, "out");
  const inGroups = getErc20TransferGroups(record, "in");
  const nativeIsOut = !!nativeData?.isNegative;
  const hasOutflows = Boolean((nativeRow && nativeIsOut) || outGroups.length);
  const hasInflows = Boolean((nativeRow && !nativeIsOut) || inGroups.length);
  if (!hasOutflows && !hasInflows) return null;

  const renderGroup = (group: (typeof outGroups)[number]) => (
    <Erc20TransferGroupRow
      key={group.key}
      group={group}
      chainId={chainId}
      explorer={explorer}
      formatUsd={formatUsd}
    />
  );

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pb={2}
      overflow="hidden"
    >
      {label && (
        <Text color="fg.secondary" fontSize="xs" fontWeight="600" pt={2.5}>
          {label}
        </Text>
      )}
      <VStack spacing={1} align="stretch">
        {hasOutflows && (
          <Box>
            <DirectionHeader direction="send" />
            {nativeRow && nativeIsOut && nativeRow}
            {outGroups.map(renderGroup)}
          </Box>
        )}
        {hasInflows && (
          <Box>
            <DirectionHeader direction="receive" />
            {nativeRow && !nativeIsOut && nativeRow}
            {inGroups.map(renderGroup)}
          </Box>
        )}
      </VStack>
    </Box>
  );
}
