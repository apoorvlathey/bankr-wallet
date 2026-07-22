import { getCachedPrivacyKey } from "../../sessionCache";
import { decryptPrivacyRecovery } from "../crypto";
import {
  applyPrivacyShieldAspApproval,
  applyPrivacyShieldAspReview,
  applyPrivacyShieldAspUnavailable,
} from "../operations/lifecycle";
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
import {
  repairPrivacyCommitmentLineages,
  type PrivacyCommitmentLineageRepairResult,
} from "../commitments/lineageIntegrity";
import type {
  PrivacyCommitmentDetailsV1,
  PrivacyCommitmentStatus,
} from "../commitments/types";
import {
  fetchPrivacyAspDepositsByLabel,
  fetchPrivacyAspLeaves,
  fetchPrivacyAspRoots,
} from "./client";
import {
  logPrivacyAspStatusResponse,
  warnPrivacyAspRefreshDeferred,
} from "./diagnostics";
import { readPrivacyAspOnchainRoots } from "./onchain";
import {
  verifyPrivacyAspMembership,
  verifyPrivacyAspPublicMembership,
} from "./membership";
export {
  verifyPrivacyAspMembership,
  verifyPrivacyAspPublicMembership,
  verifyPrivacyCommitmentAspMembership,
} from "./membership";
export type {
  PrivacyAspMembershipInput,
  PrivacyAspPublicMembershipInput,
  PrivacyCommitmentAspMembershipInput,
} from "./membership";
import {
  MAX_PRIVACY_ASP_LABELS_PER_REQUEST,
  type PrivacyAspDeposit,
  type PrivacyAspReviewStatus,
} from "./types";
import { partitionPrivacyAspStatusResponse } from "./statusResponse";
import { reconcileKnownPrivacyCommitmentsFromEvents } from "../commitments/rescan";

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
        tracking.state === "asp_unavailable" ||
        tracking.state === "asp_poi_required" ||
        tracking.state === "asp_approved" ||
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
  if (tracking.state === "asp_unavailable") return "asp_unavailable";
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

function representedOperationIds(
  commitments: Awaited<ReturnType<typeof readPrivacyCommitments>>,
): Set<string> {
  return new Set(
    commitments
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
  const represented = representedOperationIds(commitments);
  const candidates = operations
    .map((operation) => ({ operation, tracking: candidateTracking(operation) }))
    .filter((item): item is {
      operation: StoredPrivacyShieldOperationV1;
      tracking: PrivacyShieldOperationTrackingV1;
    } => item.tracking !== null && !represented.has(item.operation.summary.id));
  await materializeCandidates(material, candidates);
  return { status: "current", materialized: candidates.length };
}

/** Repair duplicate local records after the privacy capability is available. */
export async function repairPrivacyCommitmentLineagesWithActiveIdentity(): Promise<
  PrivacyCommitmentLineageRepairResult | { status: "locked" }
> {
  const material = await readPrivacyAspMasterMaterial();
  return material
    ? repairPrivacyCommitmentLineages(material)
    : { status: "locked" };
}

export async function reconcileKnownPrivacyCommitmentsWithActiveIdentity(): Promise<
  Awaited<ReturnType<typeof reconcileKnownPrivacyCommitmentsFromEvents>> |
    { status: "locked" }
> {
  const material = await readPrivacyAspMasterMaterial();
  return material
    ? reconcileKnownPrivacyCommitmentsFromEvents(material)
    : { status: "locked" };
}

async function enterAspUnavailableRecoveryMode(
  candidates: readonly {
    operation: StoredPrivacyShieldOperationV1;
    tracking: PrivacyShieldOperationTrackingV1;
  }[],
): Promise<"unavailable"> {
  const material = await readPrivacyAspMasterMaterial();
  for (const candidate of candidates) {
    await applyPrivacyShieldAspUnavailable(candidate.operation.summary.id);
    if (
      material &&
      candidate.tracking.state !== "private_ready" &&
      candidate.tracking.state !== "asp_declined" &&
      candidate.tracking.state !== "asp_removed"
    ) {
      await materializePrivacyShieldCommitment({
        material,
        operation: candidate.operation,
        tracking: candidate.tracking,
        status: "asp_unavailable",
      });
    }
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
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "shield-operations",
      phase: "status-fetch",
      candidateCount: candidates.length,
    });
    return {
      status: await enterAspUnavailableRecoveryMode(candidates),
      reviewed: 0,
      ready: 0,
    };
  }
  let response: ReturnType<typeof partitionPrivacyAspStatusResponse>;
  try {
    response = partitionPrivacyAspStatusResponse([...byLabel.keys()], deposits);
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "shield-operations",
      phase: "status-processing",
      candidateCount: candidates.length,
    });
    return {
      status: await enterAspUnavailableRecoveryMode(candidates),
      reviewed: deposits.length,
      ready: 0,
    };
  }
  logPrivacyAspStatusResponse({
    surface: "shield-operations",
    requestedCount: candidates.length,
    returnedCount: deposits.length,
    missingCount: response.missingLabels.length,
    reviewCounts: response.reviewCounts,
  });
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
    for (const label of response.missingLabels) {
      const candidate = byLabel.get(label);
      if (!candidate) throw new Error("Missing Shield candidate");
      if (
        candidate.tracking.state === "awaiting_asp" ||
        candidate.tracking.state === "asp_unavailable"
      ) {
        decisions.push({
          operationId: candidate.operation.summary.id,
          status: "pending",
          membershipVerified: false,
        });
      }
    }
  } catch {
    warnPrivacyAspRefreshDeferred({
      surface: "shield-operations",
      phase: "status-processing",
      candidateCount: candidates.length,
    });
    return {
      status: await enterAspUnavailableRecoveryMode(candidates),
      reviewed: deposits.length,
      ready: 0,
    };
  }

  for (const decision of decisions) {
    await applyPrivacyShieldAspReview(
      decision.operationId,
      decision.status,
      decision.membershipVerified,
    );
  }

  if (approved.length > 0) {
    let roots: Awaited<ReturnType<typeof fetchPrivacyAspRoots>>;
    let leaves: Awaited<ReturnType<typeof fetchPrivacyAspLeaves>>;
    let onchain: Awaited<ReturnType<typeof readPrivacyAspOnchainRoots>>;
    try {
      [roots, leaves] = await Promise.all([
        fetchPrivacyAspRoots(),
        fetchPrivacyAspLeaves(),
      ]);
      onchain = await readPrivacyAspOnchainRoots({
        expectedStateRoot: BigInt(roots.onchainMtRoot),
      });
      for (const item of approved) {
        verifyPrivacyAspPublicMembership({
          operation: item.operation,
          tracking: item.tracking,
          deposit: item.deposit,
          roots,
          leaves,
          onchain,
        });
      }
    } catch {
      warnPrivacyAspRefreshDeferred({
        surface: "shield-operations",
        phase: "membership-verification",
        candidateCount: approved.length,
      });
      return {
        status: await enterAspUnavailableRecoveryMode(
          approved.map(({ operation, tracking }) => ({ operation, tracking })),
        ),
        reviewed: deposits.length,
        ready: 0,
      };
    }

    for (const item of approved) {
      await applyPrivacyShieldAspApproval(item.operation.summary.id);
    }

    if (material) {
      try {
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
        }
        for (const commitment of verifiedCommitments) {
          await persistPrivacyShieldCommitment(material, commitment);
        }
        for (const item of approved) {
          await applyPrivacyShieldAspReview(
            item.operation.summary.id,
            "approved",
            true,
          );
        }
      } catch {
        warnPrivacyAspRefreshDeferred({
          surface: "shield-operations",
          phase: "private-lineage-verification",
          candidateCount: approved.length,
        });
        return {
          status: "current",
          reviewed: deposits.length,
          ready: 0,
        };
      }
    }
  }

  return {
    status: "current",
    reviewed: deposits.length,
    ready: verifiedCommitments.length,
  };
}
