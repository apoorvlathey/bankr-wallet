import { simulateResidualApprovals } from "../simulation/residualApprovalDetection";
import type { ResidualApprovalDetectionResult } from "../simulation/residualApprovalRequestTypes";
import { registerResidualApprovalEvidence } from "./evidenceRegistry";
import { resolveResidualApprovalRequest } from "./requestResolver";

export async function detectResidualApprovalsForPendingRequest(
  requestRef: unknown,
): Promise<ResidualApprovalDetectionResult> {
  const request = await resolveResidualApprovalRequest(requestRef);
  const projection = await simulateResidualApprovals(
    request.calls,
    request.ownerAddress,
    request.chainId,
  );
  return registerResidualApprovalEvidence({
    request,
    approvals: projection.residualApprovals,
    approvalDetectionIncomplete: projection.approvalDetectionIncomplete,
    metadataComplete: projection.metadataComplete,
  });
}
