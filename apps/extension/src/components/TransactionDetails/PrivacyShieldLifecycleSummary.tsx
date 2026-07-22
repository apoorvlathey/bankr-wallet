import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { formatEther } from "viem";

import type { PrivacyShieldHistoryMeta } from "@/chrome/txHistoryStorage";
import ShieldComplianceInfoPopover, {
  PrivacyPoolsLogo,
} from "@/components/Shield/ShieldComplianceInfoPopover";
import ShieldComplianceElapsedTime from "@/components/Shield/ShieldComplianceElapsedTime";
import ShieldComplianceProgress from "@/components/Shield/ShieldComplianceProgress";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import {
  getPrivacyShieldActivityState,
  getShieldOperationProgress,
  isPrivacyShieldCompliancePending,
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
  networkName,
  confirmedAt,
}: {
  meta: PrivacyShieldHistoryMeta;
  networkName: string;
  confirmedAt?: number;
}) {
  const activity = getPrivacyShieldActivityState(meta.state, networkName);
  const progress = getShieldOperationProgress(meta.state, networkName);
  const shieldedAmount = formatShieldedAmount(meta.shieldedAmountWei);
  const compliancePending = isPrivacyShieldCompliancePending(meta.state);
  const privacyPoolsStatus = compliancePending ||
    meta.state === "asp_approved" ||
    meta.state === "asp_unavailable" ||
    meta.state === "asp_poi_required" ||
    meta.state === "asp_declined" ||
    meta.state === "asp_removed";
  const statusDetail = meta.state === "asp_poi_required"
      ? "Privacy Pools requires Proof of Association before private withdrawal becomes available."
      : activity.context;
  const statusTitle = compliancePending
    ? "Compliance check"
    : meta.state === "asp_approved" || meta.state === "private_ready"
      ? "Confirmed"
      : progress?.label ?? activity.context;

  const cardContent = (
    <>
      <HStack align="flex-start" justify="space-between" spacing={3}>
        <HStack align="center" minW={0} spacing={3}>
          <Box
            boxSize="40px"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg={privacyPoolsStatus ? "white" : "surface.sunken"}
            color="accent.highlight"
            borderRadius="md"
            borderWidth="1px"
            borderColor="border.subtle"
          >
            {privacyPoolsStatus ? (
              <PrivacyPoolsLogo size="28px" />
            ) : (
              <PrivacyShieldIcon boxSize="20px" />
            )}
          </Box>
          <VStack minW={0} align="start" spacing={0}>
            <Text fontSize="2xs" color="fg.muted" fontWeight="600">
              {privacyPoolsStatus ? "Privacy Pools" : "Shield status"}
            </Text>
            <Text fontSize="sm" fontWeight="700" noOfLines={1}>
              {statusTitle}
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

      {compliancePending ? (
        <Box mt={3}>
          <ShieldComplianceProgress
            state={meta.state}
            confirmedAt={confirmedAt ?? meta.updatedAt}
          />
          <Text mt={2} color="fg.secondary" fontSize="xs">
            Your deposit is confirmed and being checked before it becomes
            available to Unshield or Send.
          </Text>
          <ShieldComplianceElapsedTime
            confirmedAt={confirmedAt ?? meta.updatedAt}
          />
        </Box>
      ) : progress ? (
        <Text mt={2.5} color="fg.secondary" fontSize="xs">
          {progress.description}
        </Text>
      ) : (
        <Text mt={2.5} color={`status.${activity.tone}.emphasis`} fontSize="xs">
          {statusDetail}
        </Text>
      )}
    </>
  );
  const cardProps = {
    bg: "surface.raised",
    borderWidth: "1px",
    borderColor: "border.subtle",
    borderRadius: "lg",
    px: 3,
    py: 3,
    w: "full",
    color: "fg.primary",
    textAlign: "left",
    appearance: "none",
  } as const;
  const card = compliancePending ? (
    <Box
      {...cardProps}
      as="button"
      type="button"
      cursor="help"
      aria-label="Privacy Pools compliance check status and timing"
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "border.focus",
        outlineOffset: "3px",
      }}
    >
      {cardContent}
    </Box>
  ) : (
    <Box {...cardProps}>{cardContent}</Box>
  );

  return compliancePending ? (
    <ShieldComplianceInfoPopover placement="top">
      {card}
    </ShieldComplianceInfoPopover>
  ) : card;
}
