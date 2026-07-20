import {
  generateDepositSecrets,
  generateMasterKeys,
  generateWithdrawalSecrets,
  getCommitment,
  hashPrecommitment,
} from "@0xbow/privacy-pools-core-sdk";
import type { Hash, MasterKeys, Secret } from "@0xbow/privacy-pools-core-sdk";

import { isValidPrivacyRecoveryPhrase } from "../crypto";
import { poseidon } from "./poseidonLite";

const MAX_DERIVATION_INDEX = 0xffff_ffffn;
const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface PrivacyPoolMasterKeys {
  readonly masterNullifier: bigint;
  readonly masterSecret: bigint;
}

export interface PrivacyPoolDerivedSecrets {
  readonly nullifier: bigint;
  readonly secret: bigint;
}

export interface PrivacyPoolCommitment {
  readonly hash: bigint;
  readonly precommitment: bigint;
  readonly nullifierHash: bigint;
}

function normalizePhrase(phrase: string): string {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!isValidPrivacyRecoveryPhrase(normalized)) {
    throw new Error("Invalid Privacy Pools recovery phrase");
  }
  return normalized;
}

function assertFieldElement(value: bigint, name: string): void {
  if (value <= 0n || value >= SNARK_SCALAR_FIELD) {
    throw new Error(`Invalid Privacy Pools ${name}`);
  }
}

function assertDerivationIndex(index: bigint): void {
  if (index < 0n || index > MAX_DERIVATION_INDEX) {
    throw new Error("Invalid Privacy Pools derivation index");
  }
}

function freezeSecrets(
  value: PrivacyPoolDerivedSecrets,
): PrivacyPoolDerivedSecrets {
  assertFieldElement(value.nullifier, "nullifier");
  assertFieldElement(value.secret, "secret");
  return Object.freeze({
    nullifier: value.nullifier,
    secret: value.secret,
  });
}

function asSdkMasterKeys(keys: PrivacyPoolMasterKeys): MasterKeys {
  return {
    masterNullifier: keys.masterNullifier as Secret,
    masterSecret: keys.masterSecret as Secret,
  };
}

export function derivePrivacyPoolMasterKeys(
  phrase: string,
): PrivacyPoolMasterKeys {
  const derived = generateMasterKeys(normalizePhrase(phrase));
  assertFieldElement(derived.masterNullifier, "master nullifier");
  assertFieldElement(derived.masterSecret, "master secret");
  return Object.freeze({
    masterNullifier: derived.masterNullifier,
    masterSecret: derived.masterSecret,
  });
}

export function derivePrivacyPoolDepositSecrets(
  keys: PrivacyPoolMasterKeys,
  scope: bigint,
  index: bigint,
): PrivacyPoolDerivedSecrets {
  assertFieldElement(scope, "scope");
  assertFieldElement(keys.masterNullifier, "master nullifier");
  assertFieldElement(keys.masterSecret, "master secret");
  assertDerivationIndex(index);
  return freezeSecrets(
    generateDepositSecrets(asSdkMasterKeys(keys), scope as Hash, index),
  );
}

export function derivePrivacyPoolWithdrawalSecrets(
  keys: PrivacyPoolMasterKeys,
  label: bigint,
  index: bigint,
): PrivacyPoolDerivedSecrets {
  assertFieldElement(label, "label");
  assertFieldElement(keys.masterNullifier, "master nullifier");
  assertFieldElement(keys.masterSecret, "master secret");
  assertDerivationIndex(index);
  return freezeSecrets(
    generateWithdrawalSecrets(asSdkMasterKeys(keys), label as Hash, index),
  );
}

export function derivePrivacyPoolDepositPrecommitment(
  secrets: PrivacyPoolDerivedSecrets,
): bigint {
  assertFieldElement(secrets.nullifier, "nullifier");
  assertFieldElement(secrets.secret, "secret");
  const precommitment = hashPrecommitment(
    secrets.nullifier as Secret,
    secrets.secret as Secret,
  );
  assertFieldElement(precommitment, "precommitment");
  return precommitment;
}

export function derivePrivacyPoolCommitment(
  value: bigint,
  label: bigint,
  secrets: PrivacyPoolDerivedSecrets,
): PrivacyPoolCommitment {
  if (value < 0n || value >= SNARK_SCALAR_FIELD) {
    throw new Error("Invalid Privacy Pools commitment value");
  }
  assertFieldElement(label, "label");
  const commitment = getCommitment(
    value,
    label,
    secrets.nullifier as Secret,
    secrets.secret as Secret,
  );
  assertFieldElement(commitment.hash, "commitment hash");
  // SDK 1.2.0 calls the two-secret precommitment `nullifierHash`. The
  // circuits and contracts use that term for Poseidon(nullifier), so keep the
  // two values explicit at this boundary.
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  if (commitment.nullifierHash !== precommitment) {
    throw new Error("Invalid Privacy Pools precommitment");
  }
  const nullifierHash = poseidon([secrets.nullifier]);
  assertFieldElement(nullifierHash, "nullifier hash");
  return Object.freeze({
    hash: commitment.hash,
    precommitment,
    nullifierHash,
  });
}
