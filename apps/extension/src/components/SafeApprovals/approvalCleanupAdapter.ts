import type { SafeProposalRecord } from "@/chrome/safe/types";
import { isUnsignedSafeNonceEditable } from "@/chrome/safe/proposalNonce";
import { getSafeApprovalCleanupDisabledReason } from "@/components/AssetChanges/approvalCleanupAvailability";
import { sendApprovalCleanupMessage } from "@/components/AssetChanges/approvalCleanupTransport";
import type { AssetChangesDisplayProps } from "@/components/AssetChanges/types";

export function createSafeApprovalCleanup(input: {
  proposal: SafeProposalRecord;
  busy: boolean;
  onReload: () => Promise<void>;
  onOpenProposal: (proposalId: string) => void;
}): NonNullable<AssetChangesDisplayProps["approvalCleanup"]> {
  return {
    disabledReason: getSafeApprovalCleanupDisabledReason({
      editable: isUnsignedSafeNonceEditable(input.proposal),
      busy: input.busy,
    }),
    onRevoke: async (approval) => {
      const response = await sendApprovalCleanupMessage<SafeProposalRecord>({
        type: "appendApprovalRevokeToSafeProposal",
        proposalId: input.proposal.id,
        tokenAddress: approval.tokenAddress,
        spender: approval.spender,
      });
      if (response.success && response.result) {
        await input.onReload();
        input.onOpenProposal(response.result.id);
      }
      return response;
    },
    onRevokeAll: async (approvals) => {
      const response = await sendApprovalCleanupMessage<SafeProposalRecord>({
        type: "appendApprovalRevokeToSafeProposal",
        proposalId: input.proposal.id,
        approvals: approvals.map((approval) => ({
          tokenAddress: approval.tokenAddress,
          spender: approval.spender,
        })),
      });
      if (response.success && response.result) {
        await input.onReload();
        input.onOpenProposal(response.result.id);
      }
      return response;
    },
  };
}
