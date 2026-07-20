import { CheckIcon, WarningIcon } from "@chakra-ui/icons";
import { Box, HStack, Icon, Spinner, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { ActivityStatusModel } from "./activityModel";

interface ActivityStatusProps {
  tx: CompletedTransaction;
  model: ActivityStatusModel;
}

interface ActivityStatusLabelProps {
  label: string;
  tone: "success" | "info" | "warning" | "error" | "muted";
  isPending?: boolean;
  icon?: "hourglass";
}

function HourglassIcon() {
  return (
    <Icon viewBox="0 0 24 24" boxSize="10px" flexShrink={0} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2v6l4 4-4 4v6h12v-6l-4-4 4-4V2H6zm10 15v3H8v-3l4-4 4 4zm-4-6L8 7V4h8v3l-4 4z"
      />
    </Icon>
  );
}

export function ActivityStatusLabel({
  label,
  tone,
  isPending,
  icon,
}: ActivityStatusLabelProps) {
  const color = tone === "muted" ? "fg.muted" : `status.${tone}.emphasis`;
  return (
    <HStack
      as="span"
      spacing={1}
      minW={0}
      color={color}
    >
      {icon === "hourglass" ? (
        <HourglassIcon />
      ) : isPending ? (
        <Spinner size="xs" color="currentColor" boxSize="8px" />
      ) : tone === "error" ? (
        <WarningIcon boxSize="9px" flexShrink={0} />
      ) : tone === "success" ? (
        <CheckIcon boxSize="8px" flexShrink={0} />
      ) : (
        <Box as="span" boxSize="5px" borderRadius="full" bg="currentColor" />
      )}
      <Text
        as="span"
        minW={0}
        fontSize="2xs"
        fontWeight="600"
        lineHeight="1.3"
        noOfLines={1}
      >
        {label}
      </Text>
    </HStack>
  );
}

export default function ActivityStatus({ tx, model }: ActivityStatusProps) {
  if (model.isBridgePendingDest) {
    return <ActivityStatusLabel label="Bridging" tone="info" isPending />;
  }
  if (model.isBridge && model.bridgeFulfilled) {
    return <ActivityStatusLabel label="Complete" tone="success" />;
  }
  if (model.isBridge && model.bridgeRefunded) {
    return <ActivityStatusLabel label="Refunded" tone="error" />;
  }
  if (model.isBridge && model.bridgeFailedTerminal) {
    return (
      <ActivityStatusLabel
        label={model.bridgeCode === 5 ? "Expired" : "Cancelled"}
        tone="error"
      />
    );
  }
  if (model.isForcePendingL1) {
    return <ActivityStatusLabel label="L1 pending" tone="info" isPending />;
  }
  if (model.isForcePendingL2) {
    return <ActivityStatusLabel label="L2 pending" tone="info" isPending />;
  }

  switch (tx.status) {
    case "processing":
      return <ActivityStatusLabel label="Processing" tone="info" isPending />;
    case "pending":
      return <ActivityStatusLabel label="Pending" tone="info" isPending />;
    case "success":
      return <ActivityStatusLabel label="Confirmed" tone="success" />;
    case "failed": {
      let label = "Failed";
      if (model.isForceInclusion) {
        const l1Hash = tx.forceInclusionMeta!.l1TxHash;
        const hasDistinctL2Hash = !!(tx.txHash && tx.txHash !== l1Hash);
        label = hasDistinctL2Hash ? "L2 failed" : "L1 failed";
      }
      return <ActivityStatusLabel label={label} tone="error" />;
    }
  }
}
