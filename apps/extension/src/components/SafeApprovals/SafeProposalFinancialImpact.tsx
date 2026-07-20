import { Box, Text } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";

export function SafeProposalFinancialImpact({
  proposal,
  reviewRequest,
  onRevertedChange,
  onUnavailableChange,
}: {
  proposal: SafeProposalRecord;
  reviewRequest: PendingTxRequest;
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
        embedded
        onRevertedChange={onRevertedChange}
        onSimulationUnavailableChange={onUnavailableChange}
      />
    </Box>
  );
}
