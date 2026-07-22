import { generateMerkleProof } from "@0xbow/privacy-pools-core-sdk";

import type {
  PrivacyShieldOperationDetailsV1,
  PrivacyShieldOperationTrackingV1,
  StoredPrivacyShieldOperationV1,
} from "../operations/types";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolWithdrawalSecrets,
  type PrivacyPoolMasterKeys,
} from "../protocol/primitives";
import type { PrivacyCommitmentDetailsV1 } from "../commitments/types";
import type { PrivacyAspOnchainRoots } from "./onchain";
import type {
  PrivacyAspDeposit,
  PrivacyAspLeaves,
  PrivacyAspRoots,
} from "./types";

export interface PrivacyAspMembershipInput {
  operation: StoredPrivacyShieldOperationV1;
  tracking: PrivacyShieldOperationTrackingV1;
  details: PrivacyShieldOperationDetailsV1;
  deposit: PrivacyAspDeposit;
  roots: PrivacyAspRoots;
  leaves: PrivacyAspLeaves;
  onchain: PrivacyAspOnchainRoots;
  masterKeys: PrivacyPoolMasterKeys;
}

export interface PrivacyCommitmentAspMembershipInput {
  details: PrivacyCommitmentDetailsV1;
  deposit: PrivacyAspDeposit;
  roots: PrivacyAspRoots;
  leaves: PrivacyAspLeaves;
  onchain: PrivacyAspOnchainRoots;
  masterKeys: PrivacyPoolMasterKeys;
}

export type PrivacyAspPublicMembershipInput = Omit<
  PrivacyAspMembershipInput,
  "details" | "masterKeys"
>;

function bigintLeaves(values: readonly string[]): bigint[] {
  return values.map((value) => BigInt(value));
}

function verifyPublicTreeMembership(input: {
  label: string;
  commitment: string;
  roots: PrivacyAspRoots;
  leaves: PrivacyAspLeaves;
  onchain: PrivacyAspOnchainRoots;
}): void {
  const endpointAspRoot = BigInt(input.roots.mtRoot);
  const endpointStateRoot = BigInt(input.roots.onchainMtRoot);
  if (
    endpointAspRoot !== input.onchain.associationRoot ||
    endpointStateRoot !== input.onchain.verifiedStateRoot
  ) {
    throw new Error("ASP roots do not match the active Privacy Pools deployment");
  }
  const aspProof = generateMerkleProof(
    bigintLeaves(input.leaves.aspLeaves),
    BigInt(input.label),
  );
  const stateProof = generateMerkleProof(
    bigintLeaves(input.leaves.stateTreeLeaves),
    BigInt(input.commitment),
  );
  if (aspProof.root !== endpointAspRoot || stateProof.root !== endpointStateRoot) {
    throw new Error("ASP membership roots do not match");
  }
}

/** Verify the public deposit binding and current onchain ASP membership while locked. */
export function verifyPrivacyAspPublicMembership(
  input: PrivacyAspPublicMembershipInput,
): void {
  const { operation, tracking, deposit } = input;
  if (
    tracking.txHash === null ||
    tracking.commitment === null ||
    tracking.label === null ||
    tracking.poolValueWei === null ||
    BigInt(deposit.label) !== BigInt(tracking.label) ||
    deposit.amount !== tracking.poolValueWei ||
    deposit.address.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
    deposit.txHash.toLowerCase() !== tracking.txHash.toLowerCase()
  ) {
    throw new Error("ASP deposit does not match the Shield operation");
  }
  verifyPublicTreeMembership({
    label: tracking.label,
    commitment: tracking.commitment,
    roots: input.roots,
    leaves: input.leaves,
    onchain: input.onchain,
  });
}

/** Verify service metadata, local lineage, both memberships, and both chain roots. */
export function verifyPrivacyAspMembership(input: PrivacyAspMembershipInput): void {
  const { operation, tracking, details, deposit, roots, leaves, onchain } = input;
  if (
    tracking.txHash === null ||
    tracking.commitment === null ||
    tracking.label === null ||
    tracking.poolValueWei === null ||
    BigInt(deposit.label) !== BigInt(tracking.label) ||
    deposit.amount !== tracking.poolValueWei ||
    deposit.address.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
    deposit.txHash.toLowerCase() !== tracking.txHash.toLowerCase() ||
    BigInt(deposit.precommitmentHash) !== BigInt(details.precommitment)
  ) {
    throw new Error("ASP deposit does not match the Shield operation");
  }

  verifyPrivacyCommitmentAspMembership({
    details: {
      version: 1,
      id: details.operationId,
      chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
      scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
      poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
      commitment: tracking.commitment,
      label: tracking.label,
      valueWei: tracking.poolValueWei,
      balanceWei: tracking.poolValueWei,
      precommitment: details.precommitment,
      depositIndex: details.depositIndex,
      depositor: operation.summary.accountAddress,
      depositTxHash: tracking.txHash,
      depositBlockNumber: tracking.blockNumber!,
      withdrawalIndex: "0",
      status: "awaiting_asp",
      sourceOperationId: operation.summary.id,
    },
    deposit,
    roots,
    leaves,
    onchain,
    masterKeys: input.masterKeys,
  });
}

export function verifyPrivacyCommitmentAspMembership(
  input: PrivacyCommitmentAspMembershipInput,
): void {
  const { details, deposit, roots, leaves, onchain } = input;
  if (
    BigInt(deposit.label) !== BigInt(details.label) ||
    deposit.amount !== details.valueWei ||
    deposit.address.toLowerCase() !== details.depositor.toLowerCase() ||
    deposit.txHash.toLowerCase() !== details.depositTxHash.toLowerCase() ||
    BigInt(deposit.precommitmentHash) !== BigInt(details.precommitment)
  ) {
    throw new Error("ASP deposit does not match the private commitment");
  }
  const depositSecrets = derivePrivacyPoolDepositSecrets(
    input.masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    BigInt(details.depositIndex),
  );
  const originalCommitment = derivePrivacyPoolCommitment(
    BigInt(details.valueWei),
    BigInt(details.label),
    depositSecrets,
  );
  if (originalCommitment.precommitment !== BigInt(details.precommitment)) {
    throw new Error("Shield deposit lineage does not match");
  }
  const withdrawalIndex = BigInt(details.withdrawalIndex);
  const secrets = withdrawalIndex === 0n
    ? depositSecrets
    : derivePrivacyPoolWithdrawalSecrets(
        input.masterKeys,
        BigInt(details.label),
        withdrawalIndex - 1n,
      );
  const commitment = derivePrivacyPoolCommitment(
    BigInt(details.balanceWei),
    BigInt(details.label),
    secrets,
  );
  if (commitment.hash !== BigInt(details.commitment)) {
    throw new Error("Shield commitment lineage does not match");
  }

  verifyPublicTreeMembership({
    label: details.label,
    commitment: details.commitment,
    roots,
    leaves,
    onchain,
  });
}
