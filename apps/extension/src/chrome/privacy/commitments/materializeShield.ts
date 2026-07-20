import { decryptPrivacyShieldOperationDetails } from "../operations/crypto";
import type {
  PrivacyShieldOperationDetailsV1,
  PrivacyShieldOperationTrackingV1,
  StoredPrivacyShieldOperationV1,
} from "../operations/types";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositSecrets,
  type PrivacyPoolMasterKeys,
} from "../protocol/primitives";
import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
  upsertPrivacyCommitment,
} from "./repository";
import type {
  PrivacyCommitmentDetailsV1,
  PrivacyCommitmentStatus,
} from "./types";

export interface PrivacyCommitmentMaterial {
  key: CryptoKey;
  keyId: string;
  masterKeys: PrivacyPoolMasterKeys;
}

export interface BuiltPrivacyShieldCommitment {
  commitment: PrivacyCommitmentDetailsV1;
  operationDetails: PrivacyShieldOperationDetailsV1;
}

const ASP_MANAGED_STATUSES = new Set<PrivacyCommitmentStatus>([
  "awaiting_asp",
  "asp_unavailable",
  "private_ready",
  "asp_declined",
  "asp_removed",
]);

/** Reconstruct and verify the encrypted commitment as soon as its deposit is indexed. */
export async function buildPrivacyShieldCommitment(input: {
  material: PrivacyCommitmentMaterial;
  operation: StoredPrivacyShieldOperationV1;
  tracking: PrivacyShieldOperationTrackingV1;
  status: PrivacyCommitmentStatus;
}): Promise<BuiltPrivacyShieldCommitment | null> {
  const { material, operation, tracking } = input;
  if (
    tracking.txHash === null ||
    tracking.blockNumber === null ||
    tracking.commitment === null ||
    tracking.label === null ||
    tracking.poolValueWei === null
  ) return null;

  const operationDetails = await decryptPrivacyShieldOperationDetails(
    material.key,
    material.keyId,
    operation.summary,
    operation.encryptedDetails,
  );
  if (!operationDetails) {
    throw new Error("Shield operation recovery is unavailable");
  }
  const secrets = derivePrivacyPoolDepositSecrets(
    material.masterKeys,
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
    BigInt(operationDetails.depositIndex),
  );
  const derived = derivePrivacyPoolCommitment(
    BigInt(tracking.poolValueWei),
    BigInt(tracking.label),
    secrets,
  );
  if (
    derived.hash !== BigInt(tracking.commitment) ||
    derived.precommitment !== BigInt(operationDetails.precommitment)
  ) {
    throw new Error("Shield deposit lineage does not match");
  }

  return {
    operationDetails,
    commitment: {
      version: 1,
      id: crypto.randomUUID(),
      chainId: 11_155_111,
      scope: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope.toString(),
      poolAddress: operation.summary.poolAddress,
      commitment: tracking.commitment,
      label: tracking.label,
      valueWei: tracking.poolValueWei,
      balanceWei: tracking.poolValueWei,
      precommitment: operationDetails.precommitment,
      depositIndex: operationDetails.depositIndex,
      depositor: operation.summary.accountAddress,
      depositTxHash: tracking.txHash,
      depositBlockNumber: tracking.blockNumber,
      withdrawalIndex: "0",
      status: input.status,
      sourceOperationId: operation.summary.id,
    },
  };
}

/** Insert or safely advance an ASP-managed commitment without touching an active exit. */
export async function persistPrivacyShieldCommitment(
  material: PrivacyCommitmentMaterial,
  commitment: PrivacyCommitmentDetailsV1,
): Promise<void> {
  await upsertPrivacyCommitment(material.key, material.keyId, commitment);
  const stored = (await readPrivacyCommitments(material.key, material.keyId))
    .find((item) => item.details.commitment === commitment.commitment);
  if (!stored) throw new Error("Private commitment persistence failed");
  if (stored.details.status === commitment.status) return;
  if (
    stored.details.status === "private_ready" &&
    commitment.status === "awaiting_asp"
  ) return;
  if (!ASP_MANAGED_STATUSES.has(stored.details.status)) return;
  await updatePrivacyCommitmentStatus(
    material.key,
    material.keyId,
    stored.record.id,
    commitment.status,
  );
}

export async function materializePrivacyShieldCommitment(
  input: Parameters<typeof buildPrivacyShieldCommitment>[0],
): Promise<void> {
  const built = await buildPrivacyShieldCommitment(input);
  if (!built) return;
  await persistPrivacyShieldCommitment(input.material, built.commitment);
}
