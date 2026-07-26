import type { ResidualApproval } from "./types";

export type ResidualApprovalRequestFamily =
  | "transaction"
  | "batchTransaction"
  | "crossDappBatch"
  | "safeProposal";

export interface ResidualApprovalRequestRef {
  family: ResidualApprovalRequestFamily;
  requestId: string;
}

export interface ResidualApprovalDetectionResult {
  detectionId: string;
  residualApprovals: ResidualApproval[];
  approvalDetectionIncomplete: boolean;
  metadataComplete: boolean;
}
