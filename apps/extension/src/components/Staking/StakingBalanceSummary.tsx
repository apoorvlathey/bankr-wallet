import { Box, Button, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import { formatStakingAmount } from "./model/stakingFormatting";
import type { StakingApy, StakingState } from "./types";

export function StakingBalanceSummary({
  state,
  apy,
  loading,
  claiming,
  onClaim,
}: {
  state: StakingState | null;
  apy: StakingApy | null;
  loading: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <HStack
        px={3}
        py={2.5}
        justify="space-between"
        borderBottom="1px solid"
        borderColor="border.subtle"
      >
        <HStack spacing={2} align="baseline">
          <Text fontSize="xs" color="fg.secondary" fontWeight="600">7D total APY</Text>
          <Text fontFamily="mono" fontSize="md" color="accent.highlight" fontWeight="800">
            {apy ? `${apy.totalApy.toFixed(2)}%` : "—"}
          </Text>
        </HStack>
        {apy && (
          <Text fontSize="2xs" color="fg.muted" fontWeight="600">
            WCHAN {apy.wchanApy.toFixed(1)}% + WETH {apy.wethApy.toFixed(1)}%
          </Text>
        )}
      </HStack>
      <HStack align="stretch" spacing={0}>
        <Metric
          label="Staked balance"
          value={state ? `${formatStakingAmount(state.stakedBalance)} sWCHAN` : "—"}
          loading={loading}
        />
        <Box w="1px" bg="border.subtle" flexShrink={0} />
        <Metric
          label="Claimable"
          value={state ? `${formatStakingAmount(state.earnedWeth, 6)} WETH` : "—"}
          loading={loading}
        />
      </HStack>
      <HStack
        px={3}
        py={2.5}
        justify="space-between"
        borderTop="1px solid"
        borderColor="border.subtle"
      >
        <Text fontSize="xs" color="fg.secondary">
          WETH rewards accumulate on top of your staked balance.
        </Text>
        <Button
          size="sm"
          variant="secondary"
          minW="72px"
          onClick={onClaim}
          isLoading={claiming}
          loadingText="Claim"
          isDisabled={!state || state.earnedWeth === 0n || claiming}
        >
          Claim
        </Button>
      </HStack>
    </Box>
  );
}

function Metric({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <VStack flex="1" minW={0} align="stretch" spacing={1} px={3} py={3}>
      <Text fontSize="xs" color="fg.secondary" fontWeight="600">
        {label}
      </Text>
      <Skeleton isLoaded={!loading} borderRadius="md">
        <Text fontFamily="mono" fontSize="sm" fontWeight="700" noOfLines={1}>
          {value}
        </Text>
      </Skeleton>
    </VStack>
  );
}
