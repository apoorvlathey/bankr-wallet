import type { ResidualApproval } from "../simulation/types";
import type {
  ResidualApprovalDetectionResult,
  ResidualApprovalRequestRef,
} from "../simulation/residualApprovalRequestTypes";
import {
  resolveResidualApprovalRequest,
  type ResolvedResidualApprovalRequest,
} from "./requestResolver";

const EVIDENCE_TTL_MS = 5 * 60 * 1_000;
const MAX_DETECTIONS = 32;
const MAX_TARGETS = 64;

export interface ApprovalCleanupTarget {
  tokenAddress: string;
  spender: string;
  sourceCallIndex: number;
}

interface EvidenceTarget extends ApprovalCleanupTarget {
  evidenceId: string;
}

interface EvidenceRecord {
  detectionId: string;
  ref: ResidualApprovalRequestRef;
  fingerprint: string;
  createdAt: number;
  targets: EvidenceTarget[];
}

const records = new Map<string, EvidenceRecord>();

function id(): string {
  return crypto.randomUUID();
}

function prune(now = Date.now()): void {
  for (const [detectionId, record] of records) {
    if (now - record.createdAt > EVIDENCE_TTL_MS) {
      records.delete(detectionId);
    }
  }
  while (records.size >= MAX_DETECTIONS) {
    const oldest = records.keys().next().value;
    if (typeof oldest !== "string") break;
    records.delete(oldest);
  }
}

export function registerResidualApprovalEvidence(input: {
  request: ResolvedResidualApprovalRequest;
  approvals: ResidualApproval[];
  approvalDetectionIncomplete: boolean;
  metadataComplete: boolean;
}): ResidualApprovalDetectionResult {
  prune();
  const detectionId = id();
  const targets = input.approvals.slice(0, MAX_TARGETS).map((approval) => ({
    evidenceId: id(),
    tokenAddress: approval.tokenAddress,
    spender: approval.spender,
    sourceCallIndex: approval.sourceCallIndex,
  }));
  records.set(detectionId, {
    detectionId,
    ref: input.request.ref,
    fingerprint: input.request.fingerprint,
    createdAt: Date.now(),
    targets,
  });
  return {
    detectionId,
    residualApprovals: input.approvals.slice(0, MAX_TARGETS).map(
      (approval, index) => ({
        ...approval,
        detectionId,
        evidenceId: targets[index].evidenceId,
      }),
    ),
    approvalDetectionIncomplete:
      input.approvalDetectionIncomplete ||
      input.approvals.length > MAX_TARGETS,
    metadataComplete: input.metadataComplete,
  };
}

function sameRef(
  left: ResidualApprovalRequestRef,
  right: ResidualApprovalRequestRef,
): boolean {
  return left.family === right.family && left.requestId === right.requestId;
}

export async function resolveApprovalCleanupEvidence(input: {
  ref: unknown;
  detectionId: unknown;
  evidenceIds: unknown;
}): Promise<ApprovalCleanupTarget[]> {
  prune();
  const current = await resolveResidualApprovalRequest(input.ref);
  if (
    typeof input.detectionId !== "string" ||
    !Array.isArray(input.evidenceIds) ||
    input.evidenceIds.length < 1 ||
    input.evidenceIds.length > MAX_TARGETS ||
    input.evidenceIds.some((value) => typeof value !== "string") ||
    new Set(input.evidenceIds).size !== input.evidenceIds.length
  ) {
    throw new Error("Invalid approval cleanup evidence");
  }
  const record = records.get(input.detectionId);
  if (
    !record ||
    !sameRef(record.ref, current.ref) ||
    record.fingerprint !== current.fingerprint
  ) {
    throw new Error("Approval cleanup evidence is stale");
  }
  const byId = new Map(record.targets.map((target) => [
    target.evidenceId,
    target,
  ]));
  return input.evidenceIds.map((evidenceId) => {
    const target = byId.get(evidenceId as string);
    if (!target) throw new Error("Approval cleanup evidence is stale");
    return {
      tokenAddress: target.tokenAddress,
      spender: target.spender,
      sourceCallIndex: target.sourceCallIndex,
    };
  });
}

export function resetApprovalCleanupEvidenceForTests(): void {
  records.clear();
}
