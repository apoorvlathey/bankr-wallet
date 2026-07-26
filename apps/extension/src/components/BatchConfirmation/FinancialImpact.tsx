import { Box } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import type { AssetChangesDisplayProps } from "@/components/AssetChanges/types";
import type { ResidualApprovalRequestRef } from "@/chrome/txSimulation";

interface FinancialImpactProps {
  calls: PendingBatchTxRequest["params"]["calls"];
  syntheticTxRequest: PendingTxRequest;
  isNonAtomic: boolean;
  onRevertedChange: (reverted: boolean) => void;
  onUnavailableChange: (unavailable: boolean) => void;
  approvalCleanup?: AssetChangesDisplayProps["approvalCleanup"];
  residualApprovalRequest: ResidualApprovalRequestRef;
}

export function FinancialImpact({
  calls,
  syntheticTxRequest,
  isNonAtomic,
  onRevertedChange,
  onUnavailableChange,
  approvalCleanup,
  residualApprovalRequest,
}: FinancialImpactProps) {
  return (
    <Box
      px={3}
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.subtle"
      borderRadius="lg"
      overflow="hidden"
      boxShadow="none"
    >
      <AssetChangesDisplay
        txRequest={syntheticTxRequest}
        batchCalls={calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: call.value,
        }))}
        isNonAtomic={isNonAtomic}
        embedded
        approvalCleanup={approvalCleanup}
        residualApprovalRequest={residualApprovalRequest}
        onRevertedChange={onRevertedChange}
        onSimulationUnavailableChange={onUnavailableChange}
      />
    </Box>
  );
}
