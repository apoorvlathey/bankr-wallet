import type { SafeProposalRecord } from "@/chrome/safe/types";
import { isUnsignedSafeNonceEditable } from "@/chrome/safe/proposalNonce";
import { getSafeApprovalCleanupDisabledReason } from "@/components/AssetChanges/approvalCleanupAvailability";
import {
  approvalCleanupEvidence,
  sendApprovalCleanupMessage,
} from "@/components/AssetChanges/approvalCleanupTransport";
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
      const evidence = approvalCleanupEvidence([approval]);
      if (!evidence) {
        return { success: false, error: "Approval evidence expired" };
      }
      const response = await sendApprovalCleanupMessage<SafeProposalRecord>({
        type: "appendApprovalRevokeToSafeProposal",
        proposalId: input.proposal.id,
        ...evidence,
      });
      if (response.success && response.result) {
        await input.onReload();
        input.onOpenProposal(response.result.id);
      }
      return response;
    },
    onRevokeAll: async (approvals) => {
      const evidence = approvalCleanupEvidence(approvals);
      if (!evidence) {
        return { success: false, error: "Approval evidence expired" };
      }
      const response = await sendApprovalCleanupMessage<SafeProposalRecord>({
        type: "appendApprovalRevokeToSafeProposal",
        proposalId: input.proposal.id,
        ...evidence,
      });
      if (response.success && response.result) {
        await input.onReload();
        input.onOpenProposal(response.result.id);
      }
      return response;
    },
  };
}
