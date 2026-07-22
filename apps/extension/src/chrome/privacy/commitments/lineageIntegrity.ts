import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  markPrivacyCommitmentLineageSuperseded,
  readPrivacyCommitments,
} from "./repository";
import type {
  PrivacyCommitmentDetailsV1,
  StoredPrivacyCommitmentV1,
} from "./types";

export interface PrivacyCommitmentRecordWithDetails {
  record: StoredPrivacyCommitmentV1;
  details: PrivacyCommitmentDetailsV1;
}

/** Stable deposit identity; commitment hashes change after every partial withdrawal. */
export function privacyCommitmentLineageKey(
  details: Pick<
    PrivacyCommitmentDetailsV1,
    "chainId" | "poolAddress" | "depositTxHash" | "depositIndex" | "label" | "precommitment"
  >,
): string {
  return [
    details.chainId,
    details.poolAddress.toLowerCase(),
    details.depositTxHash.toLowerCase(),
    BigInt(details.depositIndex).toString(),
    BigInt(details.label).toString(),
    BigInt(details.precommitment).toString(),
  ].join(":");
}

function preferCommitment(
  left: PrivacyCommitmentRecordWithDetails,
  right: PrivacyCommitmentRecordWithDetails,
): PrivacyCommitmentRecordWithDetails {
  const leftIndex = BigInt(left.details.withdrawalIndex);
  const rightIndex = BigInt(right.details.withdrawalIndex);
  if (leftIndex !== rightIndex) return leftIndex > rightIndex ? left : right;

  if (left.details.commitment !== right.details.commitment) {
    throw new Error("Conflicting private commitment lineage");
  }

  const leftTerminal = left.details.status === "spent" ||
    left.details.status === "ragequit_recovered";
  const rightTerminal = right.details.status === "spent" ||
    right.details.status === "ragequit_recovered";
  if (leftTerminal !== rightTerminal) return leftTerminal ? left : right;

  if (left.record.revision !== right.record.revision) {
    return left.record.revision > right.record.revision ? left : right;
  }
  return left.record.updatedAt >= right.record.updatedAt ? left : right;
}

/** Return at most one locally-current record for every original deposit lineage. */
export function canonicalPrivacyCommitments(
  commitments: readonly PrivacyCommitmentRecordWithDetails[],
): PrivacyCommitmentRecordWithDetails[] {
  const byLineage = new Map<string, PrivacyCommitmentRecordWithDetails>();
  for (const commitment of commitments) {
    const key = privacyCommitmentLineageKey(commitment.details);
    const existing = byLineage.get(key);
    byLineage.set(key, existing
      ? preferCommitment(existing, commitment)
      : commitment);
  }
  return [...byLineage.values()];
}

export interface PrivacyCommitmentLineageRepairResult {
  status: "current";
  lineages: number;
  superseded: number;
}

/**
 * Idempotently quarantine duplicate records without deleting encrypted audit
 * history. The newest derived withdrawal index remains the active lineage.
 */
export async function repairPrivacyCommitmentLineages(
  material: { key: CryptoKey; keyId: string },
): Promise<PrivacyCommitmentLineageRepairResult> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const commitments = await readPrivacyCommitments(material.key, material.keyId);
    const canonical = canonicalPrivacyCommitments(commitments);
    let superseded = 0;
    for (const current of canonical) {
      const duplicates = commitments.filter((candidate) =>
        candidate.record.id !== current.record.id &&
        privacyCommitmentLineageKey(candidate.details) ===
          privacyCommitmentLineageKey(current.details) &&
        BigInt(candidate.details.withdrawalIndex) <
          BigInt(current.details.withdrawalIndex) &&
        candidate.details.status !== "spent" &&
        candidate.details.status !== "ragequit_recovered"
      );
      if (duplicates.length === 0) continue;
      await markPrivacyCommitmentLineageSuperseded(
        material.key,
        material.keyId,
        current.details,
      );
      superseded += duplicates.length;
    }
    return { status: "current", lineages: canonical.length, superseded };
  });
}
