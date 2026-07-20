import type { PrivacyCommitmentDetailsV1 } from "../commitments/types";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolWithdrawalSecrets,
  type PrivacyPoolDerivedSecrets,
  type PrivacyPoolMasterKeys,
} from "../protocol/primitives";

export interface PrivacyWithdrawalLineage {
  readonly existingSecrets: PrivacyPoolDerivedSecrets;
  readonly newSecrets: PrivacyPoolDerivedSecrets;
  readonly spentNullifier: bigint;
  readonly newCommitment: bigint;
  readonly newBalanceWei: bigint;
  readonly newWithdrawalIndex: bigint;
}

export function derivePrivacyCurrentCommitmentSecrets(input: {
  commitment: PrivacyCommitmentDetailsV1;
  masterKeys: PrivacyPoolMasterKeys;
}): PrivacyPoolDerivedSecrets {
  const details = input.commitment;
  const withdrawalIndex = BigInt(details.withdrawalIndex);
  return withdrawalIndex === 0n
    ? derivePrivacyPoolDepositSecrets(
        input.masterKeys,
        PRIVACY_POOLS_DEPLOYMENT.scope,
        BigInt(details.depositIndex),
      )
    : derivePrivacyPoolWithdrawalSecrets(
        input.masterKeys,
        BigInt(details.label),
        withdrawalIndex - 1n,
      );
}

export function derivePrivacyWithdrawalLineage(input: {
  commitment: PrivacyCommitmentDetailsV1;
  masterKeys: PrivacyPoolMasterKeys;
  amountWei: bigint;
}): PrivacyWithdrawalLineage {
  const details = input.commitment;
  const balance = BigInt(details.balanceWei);
  const withdrawalIndex = BigInt(details.withdrawalIndex);
  if (
    details.status !== "private_ready" ||
    input.amountWei <= 0n ||
    input.amountWei > balance
  ) throw new Error("Private commitment cannot satisfy this Unshield amount");
  const existingSecrets = derivePrivacyCurrentCommitmentSecrets({
    commitment: details,
    masterKeys: input.masterKeys,
  });
  const existing = derivePrivacyPoolCommitment(
    balance,
    BigInt(details.label),
    existingSecrets,
  );
  if (existing.hash !== BigInt(details.commitment)) {
    throw new Error("Private commitment lineage changed");
  }
  const newSecrets = derivePrivacyPoolWithdrawalSecrets(
    input.masterKeys,
    BigInt(details.label),
    withdrawalIndex,
  );
  const newBalanceWei = balance - input.amountWei;
  const replacement = derivePrivacyPoolCommitment(
    newBalanceWei,
    BigInt(details.label),
    newSecrets,
  );
  return Object.freeze({
    existingSecrets,
    newSecrets,
    spentNullifier: existing.nullifierHash,
    newCommitment: replacement.hash,
    newBalanceWei,
    newWithdrawalIndex: withdrawalIndex + 1n,
  });
}
