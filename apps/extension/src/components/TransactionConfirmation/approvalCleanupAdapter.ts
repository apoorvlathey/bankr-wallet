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

export function createTransactionApprovalCleanup(input: {
  accountType?: ApprovalCleanupAccountType;
  batchStrategy: BatchStrategy;
  replacement: boolean;
  privateTransaction: boolean;
  valueMalformed: boolean;
  addToBatchDisabledReason?: string | null;
  actionReady: boolean;
  canOpenBatch: boolean;
  txId: string;
  onAddedToBatch?: () => void;
}): NonNullable<AssetChangesDisplayProps["approvalCleanup"]> {
  const requestBlockedReason = input.replacement
    ? "Replacement transactions cannot be converted into a cleanup batch."
    : input.privateTransaction
      ? "Private transactions cannot add this cleanup call."
      : input.valueMalformed
        ? "The transaction value must be valid before adding a cleanup call."
        : input.addToBatchDisabledReason
          ? input.addToBatchDisabledReason
          : !input.actionReady
            ? "Wait for the current request action to finish."
            : !input.canOpenBatch
              ? "This request surface cannot open an approval cleanup batch."
              : null;

  return {
    disabledReason: getApprovalCleanupDisabledReason({
      accountType: input.accountType,
      batchStrategy: input.batchStrategy,
      requestBlockedReason,
    }),
    onRevoke: async (approval) => {
      const evidence = approvalCleanupEvidence([approval]);
      if (!evidence) {
        return { success: false, error: "Approval evidence expired" };
      }
      const result = await sendApprovalCleanupMessage({
        type: "addApprovalRevokeToTransactionBatch",
        txId: input.txId,
        ...evidence,
      });
      if (result.success) input.onAddedToBatch?.();
      return result;
    },
    onRevokeAll: async (approvals) => {
      const evidence = approvalCleanupEvidence(approvals);
      if (!evidence) {
        return { success: false, error: "Approval evidence expired" };
      }
      const result = await sendApprovalCleanupMessage({
        type: "addApprovalRevokeToTransactionBatch",
        txId: input.txId,
        ...evidence,
      });
      if (result.success) input.onAddedToBatch?.();
      return result;
    },
  };
}
