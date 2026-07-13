import { WarningIcon } from "@chakra-ui/icons";
import { HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { ActivityStatusModel } from "./activityModel";

interface ActivityStatusProps {
  tx: CompletedTransaction;
  model: ActivityStatusModel;
}

export default function ActivityStatus({ tx, model }: ActivityStatusProps) {
  if (model.isBridgePendingDest) {
    return (
      <VStack spacing={0} align="flex-end">
        <Text fontSize="2xs" color="chart.positive" fontWeight="600">
          Source confirmed
        </Text>
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" boxSize="10px" />
          <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
            Bridging to {tx.bridge!.destinationChainName}
          </Text>
        </HStack>
      </VStack>
    );
  }
  if (model.isBridge && model.bridgeFulfilled) {
    return (
      <Text fontSize="2xs" color="chart.positive" fontWeight="600">
        Bridge complete
      </Text>
    );
  }
  if (model.isBridge && model.bridgeRefunded) {
    return (
      <HStack spacing={1}>
        <WarningIcon boxSize={2.5} color="chart.negative" />
        <Text fontSize="2xs" color="chart.negative" fontWeight="600">
          Refunded
        </Text>
      </HStack>
    );
  }
  if (model.isBridge && model.bridgeFailedTerminal) {
    return (
      <HStack spacing={1}>
        <WarningIcon boxSize={2.5} color="chart.negative" />
        <Text fontSize="2xs" color="chart.negative" fontWeight="600">
          {model.bridgeCode === 5 ? "Bridge expired" : "Bridge cancelled"}
        </Text>
      </HStack>
    );
  }
  if (model.isForcePendingL1) {
    return (
      <HStack spacing={1}>
        <Spinner size="xs" color="accent.secondary" boxSize="10px" />
        <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
          L1 pending
        </Text>
      </HStack>
    );
  }
  if (model.isForcePendingL2) {
    return (
      <VStack spacing={0} align="flex-end">
        <Text fontSize="2xs" color="chart.positive" fontWeight="600">
          L1 confirmed
        </Text>
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" boxSize="10px" />
          <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
            L2 pending
          </Text>
        </HStack>
      </VStack>
    );
  }

  switch (tx.status) {
    case "processing":
      return (
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" />
          <Text fontSize="xs" color="accent.secondary" fontWeight="600">
            Processing
          </Text>
        </HStack>
      );
    case "pending":
      return (
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" />
          <Text fontSize="xs" color="accent.secondary" fontWeight="600">
            Pending
          </Text>
        </HStack>
      );
    case "success":
      return (
        <Text fontSize="2xs" color="chart.positive" fontWeight="600">
          {tx.forceInclusionMeta ? "L1 + L2 Confirmed" : "Confirmed"}
        </Text>
      );
    case "failed": {
      let label = "Failed";
      if (model.isForceInclusion) {
        const l1Hash = tx.forceInclusionMeta!.l1TxHash;
        const hasDistinctL2Hash = !!(tx.txHash && tx.txHash !== l1Hash);
        label = hasDistinctL2Hash ? "L2 Failed" : "L1 Failed";
      }
      return (
        <HStack spacing={1}>
          <WarningIcon boxSize={2.5} color="chart.negative" />
          <Text fontSize="xs" color="chart.negative" fontWeight="600">
            {label}
          </Text>
        </HStack>
      );
    }
  }
}
