import { HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { InfoOutlineIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { formatPenaltyDate } from "./model/stakingFormatting";
import { zeroPenaltyTimestamp } from "./model/stakingModel";
import type { StakingMode, StakingState } from "./types";

export function StakingConditions({ mode, state }: { mode: StakingMode; state: StakingState | null }) {
  const penalty = Number(state?.penaltyBps ?? 0n) / 100;
  const penaltyEnds = formatPenaltyDate(zeroPenaltyTimestamp(state?.lastDepositTimestamp ?? 0n));
  const warning = mode === "unstake" && penalty > 0;

  return (
    <HStack
      align="flex-start"
      spacing={2.5}
      px={3}
      py={3}
      bg={warning ? "status.warning.tint" : "surface.sunken"}
      border="1px solid"
      borderColor={warning ? "status.warning.border" : "border.subtle"}
      borderRadius="lg"
    >
      <Icon
        as={warning ? WarningTwoIcon : InfoOutlineIcon}
        boxSize={4}
        mt="2px"
        color={warning ? "status.warning.emphasis" : "accent.secondary"}
      />
      <VStack align="stretch" spacing={1}>
        <Text fontSize="xs" fontWeight="700">
          {mode === "stake"
            ? "Early withdrawal window"
            : warning
              ? `${penalty.toFixed(1)}% early withdrawal fee`
              : "No early withdrawal fee"}
        </Text>
        <Text fontSize="xs" color="fg.secondary" lineHeight="1.45">
          {mode === "stake"
            ? "The fee starts at up to 20% and decays linearly to 0% over 7 days. Adding stake updates your weighted deposit timestamp."
            : warning
              ? `The fee is deducted from the WCHAN you receive.${penaltyEnds ? ` It reaches 0% in ${penaltyEnds}.` : ""}`
              : "Your current stake is outside the 7-day fee window."}
        </Text>
      </VStack>
    </HStack>
  );
}
