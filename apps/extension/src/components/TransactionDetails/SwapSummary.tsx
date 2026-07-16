import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

import type { SwapMeta } from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";

function TokenValue({
  symbol,
  logo,
}: {
  symbol: string;
  logo: string | null;
}) {
  return (
    <HStack spacing={2} minW={0} justify="flex-end">
      <TokenLogo logoUrl={logo} symbol={symbol} size="24px" fontSize="8px" />
      <Text color="fg.primary" fontSize="sm" fontWeight="700" noOfLines={1}>
        {symbol}
      </Text>
    </HStack>
  );
}

function SummaryRow({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <HStack
      minH="48px"
      px={3}
      py={2.5}
      spacing={3}
      justify="space-between"
      borderTopWidth={divider ? "1px" : 0}
      borderTopStyle="solid"
      borderTopColor="border.subtle"
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      {children}
    </HStack>
  );
}

export default function SwapSummary({ meta }: { meta: SwapMeta }) {
  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack align="stretch" spacing={0}>
        <SummaryRow label="Action" divider={false}>
          <Text
            minW={0}
            color="fg.primary"
            fontSize="md"
            fontWeight="700"
            lineHeight="short"
            textAlign="right"
            overflowWrap="anywhere"
          >
            Swap {meta.sellTokenSymbol} to {meta.buyTokenSymbol}
          </Text>
        </SummaryRow>
        <SummaryRow label="From">
          <TokenValue symbol={meta.sellTokenSymbol} logo={meta.sellTokenLogo} />
        </SummaryRow>
        <SummaryRow label="To">
          <TokenValue symbol={meta.buyTokenSymbol} logo={meta.buyTokenLogo} />
        </SummaryRow>
      </VStack>
    </Box>
  );
}
