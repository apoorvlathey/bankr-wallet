import { CheckIcon, WarningIcon } from "@chakra-ui/icons";
import { HStack, Spinner, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { ActivityStatusModel } from "./activityModel";

interface ActivityStatusProps {
  tx: CompletedTransaction;
  model: ActivityStatusModel;
}

interface StatusLabelProps {
  label: string;
  tone: "success" | "info" | "warning" | "error";
  isPending?: boolean;
}

function StatusLabel({ label, tone, isPending }: StatusLabelProps) {
  return (
    <HStack
      as="span"
      spacing={1}
      minW={0}
      color={`status.${tone}.emphasis`}
    >
      {isPending ? (
        <Spinner size="xs" color="currentColor" boxSize="8px" />
      ) : tone === "error" ? (
        <WarningIcon boxSize="9px" flexShrink={0} />
      ) : (
        <CheckIcon boxSize="8px" flexShrink={0} />
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
  if (model.privacyShield) {
    return (
      <StatusLabel
        label={model.privacyShield.statusLabel}
        tone={model.privacyShield.tone}
        isPending={model.privacyShield.pending}
      />
    );
  }
  if (model.isBridgePendingDest) {
    return <StatusLabel label="Bridging" tone="info" isPending />;
  }
  if (model.isBridge && model.bridgeFulfilled) {
    return <StatusLabel label="Complete" tone="success" />;
  }
  if (model.isBridge && model.bridgeRefunded) {
    return <StatusLabel label="Refunded" tone="error" />;
  }
  if (model.isBridge && model.bridgeFailedTerminal) {
    return (
      <StatusLabel
        label={model.bridgeCode === 5 ? "Expired" : "Cancelled"}
        tone="error"
      />
    );
  }
  if (model.isForcePendingL1) {
    return <StatusLabel label="L1 pending" tone="info" isPending />;
  }
  if (model.isForcePendingL2) {
    return <StatusLabel label="L2 pending" tone="info" isPending />;
  }

  switch (tx.status) {
    case "processing":
      return <StatusLabel label="Processing" tone="info" isPending />;
    case "pending":
      return <StatusLabel label="Pending" tone="info" isPending />;
    case "success":
      return <StatusLabel label="Confirmed" tone="success" />;
    case "failed": {
      let label = "Failed";
      if (model.isForceInclusion) {
        const l1Hash = tx.forceInclusionMeta!.l1TxHash;
        const hasDistinctL2Hash = !!(tx.txHash && tx.txHash !== l1Hash);
        label = hasDistinctL2Hash ? "L2 failed" : "L1 failed";
      }
      return <StatusLabel label={label} tone="error" />;
    }
  }
}
