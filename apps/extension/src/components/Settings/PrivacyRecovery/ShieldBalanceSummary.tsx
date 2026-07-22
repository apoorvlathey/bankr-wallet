import { Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { formatEther } from "viem";

import type { ShieldPortfolio } from "./types";

function formatShieldedEth(value: string): string {
  try {
    const formatted = Number.parseFloat(formatEther(BigInt(value)));
    return `${formatted.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`;
  } catch {
    return "Unavailable";
  }
}

export function ShieldBalanceSummary({ portfolio }: { portfolio: ShieldPortfolio | null }) {
  return (
    <Box
      p={3}
      bg="surface.sunken"
      border="1px solid"
      borderColor="border.default"
      borderRadius="md"
    >
      <HStack justify="space-between" align="center">
        <Text fontSize="sm" color="fg.secondary" fontWeight="600">
          Current Shield balance
        </Text>
        {!portfolio ? (
          <Spinner size="sm" color="fg.secondary" aria-label="Loading Shield balance" />
        ) : portfolio.status === "locked" ? (
          <Text fontSize="sm" color="fg.muted" fontWeight="600">Unavailable</Text>
        ) : (
          <Text
            fontSize="lg"
            color="fg.primary"
            fontWeight="700"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatShieldedEth(portfolio.confirmedBalanceWei)}
          </Text>
        )}
      </HStack>
      {portfolio?.status === "ready" ? (
        <VStack mt={3} pt={3} borderTop="1px solid" borderColor="border.subtle" spacing={1}>
          <HStack w="full" justify="space-between">
            <Text fontSize="xs" color="fg.secondary">Ready to Unshield</Text>
            <Text fontSize="xs" color="fg.primary" fontWeight="600">
              {formatShieldedEth(portfolio.readyBalanceWei)}
            </Text>
          </HStack>
          <HStack w="full" justify="space-between">
            <Text fontSize="xs" color="fg.secondary">Awaiting ASP review</Text>
            <Text fontSize="xs" color="status.warning.emphasis" fontWeight="600">
              {formatShieldedEth(portfolio.pendingBalanceWei)}
            </Text>
          </HStack>
        </VStack>
      ) : null}
    </Box>
  );
}
