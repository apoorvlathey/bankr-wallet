import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
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
import { readPrivacyAspOnchainRoots } from "./onchain";
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
  const stored = await readPrivacyCommitments(material.key, material.keyId);
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
    if (deposits.length !== byLabel.size) {
      throw new Error("ASP did not return every private label");
    }
  } catch {
    for (const candidate of candidates) {
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        candidate.record.id,
        "asp_unavailable",
      );
    }
    return { status: "unavailable", reviewed: 0, ready: 0 };
  }
  const approved: Array<{
    record: StoredPrivacyCommitmentV1;
    details: PrivacyCommitmentDetailsV1;
    deposit: PrivacyAspDeposit;
  }> = [];
  const decisions: Array<{ id: string; status: PrivacyCommitmentStatus }> = [];
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
        });
      }
    }
    if (approved.length > 0) {
      const [roots, leaves, onchain] = await Promise.all([
        fetchPrivacyAspRoots(),
        fetchPrivacyAspLeaves(),
        readPrivacyAspOnchainRoots(),
      ]);
      for (const candidate of approved) {
        verifyPrivacyCommitmentAspMembership({
          details: candidate.details,
          deposit: candidate.deposit,
          roots,
          leaves,
          onchain,
          masterKeys: material.masterKeys,
        });
        decisions.push({ id: candidate.record.id, status: "private_ready" });
      }
    }
  } catch {
    for (const candidate of candidates) {
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        candidate.record.id,
        "asp_unavailable",
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
    );
  }
  return {
    status: "current",
    reviewed: deposits.length,
    ready: approved.length,
  };
}
