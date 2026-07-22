import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import {
  canonicalPrivacyCommitments,
  repairPrivacyCommitmentLineages,
} from "../commitments/lineageIntegrity";
import type {
  PrivacyCommitmentDetailsV1,
  PrivacyCommitmentStatus,
  StoredPrivacyCommitmentV1,
} from "../commitments/types";
import {
  fetchPrivacyAspStatuses,
  readPrivacyAspMasterMaterial,
  verifyPrivacyCommitmentAspMembership,
} from "./eligibility";
import { fetchPrivacyAspLeaves, fetchPrivacyAspRoots } from "./client";
import {
  logPrivacyAspStatusResponse,
  warnPrivacyAspRefreshDeferred,
} from "./diagnostics";
import { readPrivacyAspOnchainRoots } from "./onchain";
import { partitionPrivacyAspStatusResponse } from "./statusResponse";
import type { PrivacyAspDeposit, PrivacyAspReviewStatus } from "./types";

export interface PrivacyCommitmentEligibilityResult {
  status: "idle" | "locked" | "current" | "unavailable";
  reviewed: number;
  ready: number;
}

export function nextPrivacyCommitmentAspStatus(
  current: PrivacyCommitmentStatus,
  review: PrivacyAspReviewStatus,
): PrivacyCommitmentStatus {
  if (review === "approved") return "private_ready";
  if (review === "declined") return "asp_declined";
  if (review === "spent") return "spent";
  if (review === "exited") return "ragequit_recovered";
  // A temporary pending/POI response must not erase previously verified
  // membership; it remains usable until a later onchain-root check says otherwise.
  return current === "private_ready" ? current : "awaiting_asp";
}

/** Refresh encrypted recovered commitments without exposing their contents to UI. */
export async function refreshPrivacyCommitmentEligibility(): Promise<PrivacyCommitmentEligibilityResult> {
  const material = await readPrivacyAspMasterMaterial();
  if (!material) return { status: "locked", reviewed: 0, ready: 0 };
  await repairPrivacyCommitmentLineages(material);
  const stored = canonicalPrivacyCommitments(
    await readPrivacyCommitments(material.key, material.keyId),
  );
  const candidates = stored.filter((item) =>
    item.details.status !== "spent" &&
    item.details.status !== "ragequit_recovered" &&
    item.details.status !== "withdrawal_pending" &&
    item.details.status !== "ragequit_pending"
  );
  if (candidates.length === 0) return { status: "idle", reviewed: 0, ready: 0 };
  const byLabel = new Map<string, {
    record: StoredPrivacyCommitmentV1;
    details: PrivacyCommitmentDetailsV1;
  }>();
  for (const candidate of candidates) {
    const label = BigInt(candidate.details.label).toString();
    if (byLabel.has(label)) throw new Error("Duplicate private commitment label");
    byLabel.set(label, candidate);
  }
  let deposits: PrivacyAspDeposit[];
  try {
    deposits = await fetchPrivacyAspStatuses([...byLabel.keys()]);
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "private-commitments",
      phase: "status-fetch",
      candidateCount: candidates.length,
    });
    for (const candidate of candidates) {
      if (candidate.details.status === "private_ready") continue;
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        candidate.record.id,
        "asp_unavailable",
        {
          revision: candidate.record.revision,
          status: candidate.details.status,
        },
      );
    }
    return { status: "unavailable", reviewed: 0, ready: 0 };
  }
  let response: ReturnType<typeof partitionPrivacyAspStatusResponse>;
  try {
    response = partitionPrivacyAspStatusResponse([...byLabel.keys()], deposits);
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "private-commitments",
      phase: "status-processing",
      candidateCount: candidates.length,
    });
    for (const candidate of candidates) {
      if (candidate.details.status === "private_ready") continue;
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        candidate.record.id,
        "asp_unavailable",
        {
          revision: candidate.record.revision,
          status: candidate.details.status,
        },
      );
    }
    return { status: "unavailable", reviewed: deposits.length, ready: 0 };
  }
  logPrivacyAspStatusResponse({
    surface: "private-commitments",
    requestedCount: candidates.length,
    returnedCount: deposits.length,
    missingCount: response.missingLabels.length,
    reviewCounts: response.reviewCounts,
  });
  const approved: Array<{
    record: StoredPrivacyCommitmentV1;
    details: PrivacyCommitmentDetailsV1;
    deposit: PrivacyAspDeposit;
  }> = [];
  const decisions: Array<{
    id: string;
    status: PrivacyCommitmentStatus;
    expectedRevision: number;
    expectedStatus: PrivacyCommitmentStatus;
  }> = [];
  try {
    for (const deposit of deposits) {
      const candidate = byLabel.get(BigInt(deposit.label).toString());
      if (!candidate) throw new Error("ASP returned an unknown private label");
      if (deposit.reviewStatus === "approved") {
        approved.push({ ...candidate, deposit });
      } else {
        decisions.push({
          id: candidate.record.id,
          status: nextPrivacyCommitmentAspStatus(
            candidate.details.status,
            deposit.reviewStatus,
          ),
          expectedRevision: candidate.record.revision,
          expectedStatus: candidate.details.status,
        });
      }
    }
    for (const label of response.missingLabels) {
      const candidate = byLabel.get(label);
      if (!candidate) throw new Error("Missing private commitment candidate");
      if (
        candidate.details.status === "awaiting_asp" ||
        candidate.details.status === "asp_unavailable"
      ) {
        decisions.push({
          id: candidate.record.id,
          status: "awaiting_asp",
          expectedRevision: candidate.record.revision,
          expectedStatus: candidate.details.status,
        });
      }
    }
    if (approved.length > 0) {
      const [roots, leaves] = await Promise.all([
        fetchPrivacyAspRoots(),
        fetchPrivacyAspLeaves(),
      ]);
      const onchain = await readPrivacyAspOnchainRoots({
        expectedStateRoot: BigInt(roots.onchainMtRoot),
      });
      for (const candidate of approved) {
        verifyPrivacyCommitmentAspMembership({
          details: candidate.details,
          deposit: candidate.deposit,
          roots,
          leaves,
          onchain,
          masterKeys: material.masterKeys,
        });
        decisions.push({
          id: candidate.record.id,
          status: "private_ready",
          expectedRevision: candidate.record.revision,
          expectedStatus: candidate.details.status,
        });
      }
    }
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "private-commitments",
      phase: approved.length > 0
        ? "membership-verification"
        : "status-processing",
      candidateCount: candidates.length,
    });
    for (const candidate of candidates) {
      if (candidate.details.status === "private_ready") continue;
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        candidate.record.id,
        "asp_unavailable",
        {
          revision: candidate.record.revision,
          status: candidate.details.status,
        },
      );
    }
    return { status: "unavailable", reviewed: deposits.length, ready: 0 };
  }
  for (const decision of decisions) {
    await updatePrivacyCommitmentStatus(
      material.key,
      material.keyId,
      decision.id,
      decision.status,
      {
        revision: decision.expectedRevision,
        status: decision.expectedStatus,
      },
    );
  }
  return {
    status: "current",
    reviewed: deposits.length,
    ready: approved.length,
  };
}
