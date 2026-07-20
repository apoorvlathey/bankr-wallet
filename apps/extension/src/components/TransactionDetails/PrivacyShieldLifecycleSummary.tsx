import { Box, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { formatEther } from "viem";

import type { PrivacyShieldHistoryMeta } from "@/chrome/txHistoryStorage";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import {
  getPrivacyShieldActivityState,
  getShieldOperationProgress,
  SHIELD_PROGRESS_STEPS,
} from "@/lib/privacyShieldLifecycle";
import { formatTokenDecimalAmount } from "@/lib/tokenAmountFormat";

function formatShieldedAmount(amountWei: string): string | null {
  try {
    return `${formatTokenDecimalAmount(formatEther(BigInt(amountWei)))} ETH`;
  } catch {
    return null;
  }
}

/** Durable Privacy Pools progress projected alongside the ordinary transaction. */
export default function PrivacyShieldLifecycleSummary({
  meta,
}: {
  meta: PrivacyShieldHistoryMeta;
}) {
  const activity = getPrivacyShieldActivityState(meta.state);
  const progress = getShieldOperationProgress(meta.state);
  const shieldedAmount = formatShieldedAmount(meta.shieldedAmountWei);

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="lg"
      px={3}
      py={3}
    >
      <HStack align="flex-start" justify="space-between" spacing={3}>
        <HStack align="center" minW={0} spacing={3}>
          <Box
            boxSize="40px"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg="surface.sunken"
            color="accent.highlight"
            borderRadius="md"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <PrivacyShieldIcon boxSize="20px" />
          </Box>
          <VStack minW={0} align="start" spacing={0}>
            <Text fontSize="2xs" color="fg.muted" fontWeight="600">
              Shield status
            </Text>
            <Text fontSize="sm" fontWeight="700" noOfLines={1}>
              {progress?.label ?? activity.context}
            </Text>
          </VStack>
        </HStack>
        {shieldedAmount ? (
          <VStack flexShrink={0} align="end" spacing={0}>
            <Text fontSize="sm" fontWeight="700" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {shieldedAmount}
            </Text>
            <Text fontSize="2xs" color="fg.muted">
              Shielded ETH
            </Text>
          </VStack>
        ) : null}
      </HStack>

      {progress ? (
        <Box mt={3}>
          <SimpleGrid
            columns={SHIELD_PROGRESS_STEPS}
            spacing={1}
            role="progressbar"
            aria-label="Shield progress"
            aria-valuemin={0}
            aria-valuemax={SHIELD_PROGRESS_STEPS}
            aria-valuenow={progress.completedSteps}
            aria-valuetext={`${activity.statusLabel}: ${progress.description}`}
          >
            {Array.from({ length: SHIELD_PROGRESS_STEPS }, (_, index) => {
              const complete = index < progress.completedSteps;
              const current = !progress.complete && index === progress.step - 1;
              return (
                <Box
                  key={index}
                  h="4px"
                  borderRadius="full"
                  bg={complete
                    ? "accent.secondary"
                    : current
                      ? "accent.highlight"
                      : "surface.raisedHover"}
                  aria-hidden
                />
              );
            })}
          </SimpleGrid>
          <Text mt={2} color="fg.secondary" fontSize="xs">
            {progress.description}
          </Text>
        </Box>
      ) : (
        <Text mt={2.5} color={`status.${activity.tone}.emphasis`} fontSize="xs">
          {activity.context}
        </Text>
      )}
    </Box>
  );
}
