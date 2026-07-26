import type { ResidualApproval } from "@/chrome/txSimulation";
import {
  getApprovalCleanupDisabledReason,
  type ApprovalCleanupAccountType,
} from "@/components/AssetChanges/approvalCleanupAvailability";
import { sendApprovalCleanupMessage } from "@/components/AssetChanges/approvalCleanupTransport";
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
      ((approval) =>
        sendApprovalCleanupMessage({
          type: "appendApprovalRevokeToPendingBatch",
          bundleId: input.bundleId,
          tokenAddress: approval.tokenAddress,
          spender: approval.spender,
        })),
    onRevokeAll: input.allHandler ??
      ((approvals) =>
        sendApprovalCleanupMessage({
          type: "appendApprovalRevokeToPendingBatch",
          bundleId: input.bundleId,
          approvals: approvals.map((approval) => ({
            tokenAddress: approval.tokenAddress,
            spender: approval.spender,
          })),
        })),
  };
}
