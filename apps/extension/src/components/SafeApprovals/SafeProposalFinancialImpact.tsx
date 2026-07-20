import { Box, Text } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";

export function SafeProposalFinancialImpact({
  proposal,
  reviewRequest,
  executionRequest,
  onRevertedChange,
  onUnavailableChange,
}: {
  proposal: SafeProposalRecord;
  reviewRequest: PendingTxRequest;
  executionRequest: PendingTxRequest | null;
  onRevertedChange: (reverted: boolean) => void;
  onUnavailableChange: (unavailable: boolean) => void;
}) {
  if (proposal.purpose === "rejection") {
    return (
      <Box
        px={3}
        py={3}
        bg="surface.raised"
        border="1px solid"
        borderColor="border.subtle"
        borderRadius="lg"
      >
        <Text color="fg.secondary" fontSize="sm">
          No Safe asset changes
        </Text>
      </Box>
    );
  }

  return (
    <Box
      px={3}
      bg="surface.raised"
      border="1px solid"
      borderColor="border.subtle"
      borderRadius="lg"
      overflow="hidden"
    >
      <AssetChangesDisplay
        txRequest={reviewRequest}
        batchCalls={proposal.calls}
        safeExecutionRequest={executionRequest ?? undefined}
        embedded
        onRevertedChange={onRevertedChange}
        onSimulationUnavailableChange={onUnavailableChange}
      />
    </Box>
  );
}
