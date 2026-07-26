import {
  getApprovalCleanupDisabledReason,
  type ApprovalCleanupAccountType,
} from "@/components/AssetChanges/approvalCleanupAvailability";
import { sendApprovalCleanupMessage } from "@/components/AssetChanges/approvalCleanupTransport";
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
      const result = await sendApprovalCleanupMessage({
        type: "addApprovalRevokeToTransactionBatch",
        txId: input.txId,
        tokenAddress: approval.tokenAddress,
        spender: approval.spender,
      });
      if (result.success) input.onAddedToBatch?.();
      return result;
    },
    onRevokeAll: async (approvals) => {
      const result = await sendApprovalCleanupMessage({
        type: "addApprovalRevokeToTransactionBatch",
        txId: input.txId,
        approvals: approvals.map((approval) => ({
          tokenAddress: approval.tokenAddress,
          spender: approval.spender,
        })),
      });
      if (result.success) input.onAddedToBatch?.();
      return result;
    },
  };
}
