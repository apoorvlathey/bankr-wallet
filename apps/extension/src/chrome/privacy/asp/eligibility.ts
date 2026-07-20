import { getCachedPrivacyKey } from "../../sessionCache";
import { decryptPrivacyRecovery } from "../crypto";
import { applyPrivacyShieldAspReview } from "../operations/lifecycle";
import { listAllPrivacyShieldOperations } from "../operations/repository";
import type {
  PrivacyShieldOperationTrackingV1,
  StoredPrivacyShieldOperationV1,
} from "../operations/types";
import { derivePrivacyPoolMasterKeys } from "../protocol/primitives";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import {
  buildPrivacyShieldCommitment,
  materializePrivacyShieldCommitment,
  persistPrivacyShieldCommitment,
  type PrivacyCommitmentMaterial,
} from "../commitments/materializeShield";
import { readPrivacyCommitments } from "../commitments/repository";
import type {
  PrivacyCommitmentDetailsV1,
  PrivacyCommitmentStatus,
} from "../commitments/types";
import {
  fetchPrivacyAspDepositsByLabel,
  fetchPrivacyAspLeaves,
  fetchPrivacyAspRoots,
} from "./client";
import { readPrivacyAspOnchainRoots } from "./onchain";
import { verifyPrivacyAspMembership } from "./membership";
export {
  verifyPrivacyAspMembership,
  verifyPrivacyCommitmentAspMembership,
} from "./membership";
export type {
  PrivacyAspMembershipInput,
  PrivacyCommitmentAspMembershipInput,
} from "./membership";
import {
  MAX_PRIVACY_ASP_LABELS_PER_REQUEST,
  type PrivacyAspDeposit,
  type PrivacyAspReviewStatus,
} from "./types";

export interface PrivacyAspEligibilityRefreshResult {
  status: "idle" | "locked" | "current" | "unavailable";
  reviewed: number;
  ready: number;
}

function candidateTracking(
  operation: StoredPrivacyShieldOperationV1,
): PrivacyShieldOperationTrackingV1 | null {
  const tracking = operation.tracking;
  return tracking &&
      tracking.label !== null &&
      (tracking.state === "awaiting_asp" ||
        tracking.state === "private_ready" ||
        tracking.state === "asp_declined" ||
        tracking.state === "asp_removed")
    ? tracking
    : null;
}

function materializationStatus(
  tracking: PrivacyShieldOperationTrackingV1,
): PrivacyCommitmentStatus {
  if (tracking.state === "private_ready") return "private_ready";
  if (tracking.state === "asp_declined") return "asp_declined";
  if (tracking.state === "asp_removed") return "asp_removed";
  return "awaiting_asp";
}

function exitClaimedOperationIds(
  commitments: Awaited<ReturnType<typeof readPrivacyCommitments>>,
): Set<string> {
  return new Set(
    commitments
      .filter(({ details }) =>
        details.status === "withdrawal_pending" ||
        details.status === "ragequit_pending" ||
        details.status === "spent" ||
        details.status === "ragequit_recovered"
      )
      .map(({ details }) => details.sourceOperationId)
      .filter((id): id is string => id !== null),
  );
}

async function materializeCandidates(
  material: PrivacyCommitmentMaterial,
  candidates: readonly {
    operation: StoredPrivacyShieldOperationV1;
    tracking: PrivacyShieldOperationTrackingV1;
  }[],
): Promise<void> {
  for (const candidate of candidates) {
    await materializePrivacyShieldCommitment({
      material,
      operation: candidate.operation,
      tracking: candidate.tracking,
      status: materializationStatus(candidate.tracking),
    });
  }
}

function assertPublicDepositBinding(
  operation: StoredPrivacyShieldOperationV1,
  tracking: PrivacyShieldOperationTrackingV1,
  deposit: PrivacyAspDeposit,
): void {
  if (
    tracking.txHash === null ||
    tracking.poolValueWei === null ||
    tracking.label === null ||
    BigInt(deposit.label) !== BigInt(tracking.label) ||
    deposit.amount !== tracking.poolValueWei ||
    deposit.address.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
    deposit.txHash.toLowerCase() !== tracking.txHash.toLowerCase()
  ) {
    throw new Error("ASP deposit does not match the Shield operation");
  }
}

export async function fetchPrivacyAspStatuses(
  labels: readonly string[],
): Promise<PrivacyAspDeposit[]> {
  const deposits: PrivacyAspDeposit[] = [];
  for (let index = 0; index < labels.length; index += MAX_PRIVACY_ASP_LABELS_PER_REQUEST) {
    deposits.push(...await fetchPrivacyAspDepositsByLabel(
      labels.slice(index, index + MAX_PRIVACY_ASP_LABELS_PER_REQUEST),
    ));
  }
  return deposits;
}

export async function readPrivacyAspMasterMaterial(): Promise<
  PrivacyCommitmentMaterial | null
> {
  const [vault, privacyKey] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
  ]);
  if (
    vault.status !== "valid" ||
    vault.record.recovery === null ||
    !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) {
    return null;
  }
  const phrase = await decryptPrivacyRecovery(
    privacyKey.key,
    vault.record.keyId,
    vault.record.recovery,
  );
  if (!phrase) return null;
  return {
    key: privacyKey.key,
    keyId: privacyKey.keyId,
    masterKeys: derivePrivacyPoolMasterKeys(phrase),
  };
}

/** Materialize exact indexed deposits locally without waiting for ASP transport. */
export async function materializeIndexedPrivacyShieldCommitments(): Promise<{
  status: "current" | "locked";
  materialized: number;
}> {
  const [operations, material] = await Promise.all([
    listAllPrivacyShieldOperations(),
    readPrivacyAspMasterMaterial(),
  ]);
  if (!material) return { status: "locked", materialized: 0 };
  const commitments = await readPrivacyCommitments(material.key, material.keyId);
  const claimed = exitClaimedOperationIds(commitments);
  const candidates = operations
    .map((operation) => ({ operation, tracking: candidateTracking(operation) }))
    .filter((item): item is {
      operation: StoredPrivacyShieldOperationV1;
      tracking: PrivacyShieldOperationTrackingV1;
    } => item.tracking !== null && !claimed.has(item.operation.summary.id));
  await materializeCandidates(material, candidates);
  return { status: "current", materialized: candidates.length };
}

async function enterAspUnavailableRecoveryMode(
  candidates: readonly {
    operation: StoredPrivacyShieldOperationV1;
    tracking: PrivacyShieldOperationTrackingV1;
  }[],
): Promise<"locked" | "unavailable"> {
  const material = await readPrivacyAspMasterMaterial();
  if (!material) return "locked";
  for (const candidate of candidates) {
    await materializePrivacyShieldCommitment({
      material,
      operation: candidate.operation,
      tracking: candidate.tracking,
      status: "asp_unavailable",
    });
  }
  return "unavailable";
}

/** Refresh only known labels; no wallet address inventory is sent to the ASP. */
export async function refreshPrivacyAspEligibility(): Promise<PrivacyAspEligibilityRefreshResult> {
  const operations = await listAllPrivacyShieldOperations();
  const material = await readPrivacyAspMasterMaterial();
  const commitments = material
    ? await readPrivacyCommitments(material.key, material.keyId)
    : [];
  const exitClaimedOperations = exitClaimedOperationIds(commitments);
  const candidates = operations
    .map((operation) => ({ operation, tracking: candidateTracking(operation) }))
    .filter((item): item is {
      operation: StoredPrivacyShieldOperationV1;
      tracking: PrivacyShieldOperationTrackingV1;
    } => item.tracking !== null &&
      !exitClaimedOperations.has(item.operation.summary.id));
  if (candidates.length === 0) return { status: "idle", reviewed: 0, ready: 0 };
  if (material) await materializeCandidates(material, candidates);

  const byLabel = new Map(
    candidates.map((item) => [BigInt(item.tracking.label!).toString(), item]),
  );
  if (byLabel.size !== candidates.length) {
    throw new Error("Duplicate Shield labels");
  }
  let deposits: PrivacyAspDeposit[];
  try {
    deposits = await fetchPrivacyAspStatuses([...byLabel.keys()]);
    if (deposits.length !== byLabel.size) {
      throw new Error("ASP did not return every Shield label");
    }
  } catch {
    return {
      status: await enterAspUnavailableRecoveryMode(candidates),
      reviewed: 0,
      ready: 0,
    };
  }
  const decisions: Array<{
    operationId: string;
    status: PrivacyAspReviewStatus;
    membershipVerified: boolean;
  }> = [];
  const approved: Array<{
    operation: StoredPrivacyShieldOperationV1;
    tracking: PrivacyShieldOperationTrackingV1;
    deposit: PrivacyAspDeposit;
  }> = [];
  const verifiedCommitments: PrivacyCommitmentDetailsV1[] = [];
  try {
    for (const deposit of deposits) {
      const candidate = byLabel.get(BigInt(deposit.label).toString());
      if (!candidate) throw new Error("ASP returned an unknown Shield label");
      assertPublicDepositBinding(candidate.operation, candidate.tracking, deposit);
      if (deposit.reviewStatus === "approved") {
        approved.push({ ...candidate, deposit });
      } else {
        if (material) {
          await materializePrivacyShieldCommitment({
            material,
            operation: candidate.operation,
            tracking: candidate.tracking,
            status: deposit.reviewStatus === "pending" ||
                deposit.reviewStatus === "poi_required"
              ? "awaiting_asp"
              : deposit.reviewStatus === "declined"
                ? "asp_declined"
                : "asp_removed",
          });
        }
        decisions.push({
          operationId: candidate.operation.summary.id,
          status: deposit.reviewStatus,
          membershipVerified: false,
        });
      }
    }
  } catch {
    return {
      status: await enterAspUnavailableRecoveryMode(candidates),
      reviewed: deposits.length,
      ready: 0,
    };
  }

  if (approved.length > 0) {
    if (!material) {
      for (const decision of decisions) {
        await applyPrivacyShieldAspReview(
          decision.operationId,
          decision.status,
          decision.membershipVerified,
        );
      }
      return { status: "locked", reviewed: deposits.length, ready: 0 };
    }
    try {
      const [roots, leaves, onchain] = await Promise.all([
        fetchPrivacyAspRoots(),
        fetchPrivacyAspLeaves(),
        readPrivacyAspOnchainRoots(),
      ]);
      for (const item of approved) {
        const built = await buildPrivacyShieldCommitment({
          material,
          operation: item.operation,
          tracking: item.tracking,
          status: "private_ready",
        });
        if (!built) throw new Error("Shield commitment is incomplete");
        verifyPrivacyAspMembership({
          ...item,
          details: built.operationDetails,
          roots,
          leaves,
          onchain,
          masterKeys: material.masterKeys,
        });
        verifiedCommitments.push(built.commitment);
        decisions.push({
          operationId: item.operation.summary.id,
          status: "approved",
          membershipVerified: true,
        });
      }
    } catch {
      return {
        status: await enterAspUnavailableRecoveryMode(candidates),
        reviewed: deposits.length,
        ready: 0,
      };
    }
    for (const commitment of verifiedCommitments) {
      await persistPrivacyShieldCommitment(material, commitment);
    }
  }

  for (const decision of decisions) {
    await applyPrivacyShieldAspReview(
      decision.operationId,
      decision.status,
      decision.membershipVerified,
    );
  }
  return {
    status: "current",
    reviewed: deposits.length,
    ready: approved.length,
  };
}
