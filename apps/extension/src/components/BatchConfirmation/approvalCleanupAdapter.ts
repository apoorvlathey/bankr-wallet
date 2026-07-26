import type { ResidualApproval } from "@/chrome/txSimulation";
import {
  getApprovalCleanupDisabledReason,
  type ApprovalCleanupAccountType,
} from "@/components/AssetChanges/approvalCleanupAvailability";
import {
  approvalCleanupEvidence,
  sendApprovalCleanupMessage,
} from "@/components/AssetChanges/approvalCleanupTransport";
import type { AssetChangesDisplayProps } from "@/components/AssetChanges/types";
import type { BatchStrategy } from "@/hooks/useBatchPlan";

type CleanupHandler = (
  approval: ResidualApproval,
) => Promise<{ success: boolean; error?: string }>;
type CleanupAllHandler = (
  approvals: ResidualApproval[],
) => Promise<{ success: boolean; error?: string }>;

export function createBatchApprovalCleanup(input: {
  accountType?: ApprovalCleanupAccountType;
  batchStrategy: BatchStrategy;
  requestBlockedReason?: string | null;
  bundleId: string;
  handler?: CleanupHandler;
  allHandler?: CleanupAllHandler;
}): NonNullable<AssetChangesDisplayProps["approvalCleanup"]> {
  return {
    disabledReason: getApprovalCleanupDisabledReason(input),
    onRevoke: input.handler ??
      ((approval) => {
        const evidence = approvalCleanupEvidence([approval]);
        if (!evidence) {
          return Promise.resolve({
            success: false,
            error: "Approval evidence expired",
          });
        }
        return sendApprovalCleanupMessage({
          type: "appendApprovalRevokeToPendingBatch",
          bundleId: input.bundleId,
          ...evidence,
        });
      }),
    onRevokeAll: input.allHandler ??
      ((approvals) => {
        const evidence = approvalCleanupEvidence(approvals);
        if (!evidence) {
          return Promise.resolve({
            success: false,
            error: "Approval evidence expired",
          });
        }
        return sendApprovalCleanupMessage({
          type: "appendApprovalRevokeToPendingBatch",
          bundleId: input.bundleId,
          ...evidence,
        });
      }),
  };
}
