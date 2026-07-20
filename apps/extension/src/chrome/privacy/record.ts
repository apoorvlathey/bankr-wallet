import {
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../cryptography/base64";
import type {
  PrivacyDerivationMetadataV1,
  PrivacyEncryptedRecoveryV1,
  PrivacyKeyCheckV1,
  PrivacyVaultRecordV1,
  PrivacyWrappedKey,
} from "./types";

export const PRIVACY_VAULT_STORAGE_KEY = "privacyVault";
export const PRIVACY_VAULT_VERSION = 1;
export const PRIVACY_KEY_BYTES = 32;
export const PRIVACY_IV_BYTES = 12;
const PRIVACY_KEY_CIPHERTEXT_BYTES = PRIVACY_KEY_BYTES + 16;
const MAX_PRIVACY_KEY_ID_LENGTH = 128;
const MAX_RECOVERY_CIPHERTEXT_BYTES = 1_024;

export const PRIVACY_DERIVATION_V1: PrivacyDerivationMetadataV1 =
  Object.freeze({
    schema: "walletchan-privacy-root-v1",
    protocol: "privacy-pools-v1",
    phraseStandard: "bip39-english-128",
    phraseWords: 12,
    derivationVariant: "safe-bigint-v1",
  });

function isExactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isValidWrappedKey(value: unknown): value is PrivacyWrappedKey {
  if (!isExactObject(value, ["ciphertext", "iv"])) return false;
  const candidate = value as Partial<PrivacyWrappedKey>;
  return (
    decodeBase64Exact(candidate.iv, PRIVACY_IV_BYTES) !== null &&
    decodeBase64Exact(
      candidate.ciphertext,
      PRIVACY_KEY_CIPHERTEXT_BYTES,
    ) !== null
  );
}

function isValidMasterWrappedKey(value: unknown): boolean {
  if (!isExactObject(value, ["ciphertext", "iv", "salt"])) return false;
  const candidate = value as {
    ciphertext?: unknown;
    iv?: unknown;
    salt?: unknown;
  };
  return (
    decodeBase64Exact(candidate.salt, 16) !== null &&
    decodeBase64Exact(candidate.iv, PRIVACY_IV_BYTES) !== null &&
    decodeBase64Exact(
      candidate.ciphertext,
      PRIVACY_KEY_CIPHERTEXT_BYTES,
    ) !== null
  );
}

function isValidKeyCheck(value: unknown): value is PrivacyKeyCheckV1 {
  if (!isExactObject(value, ["version", "scheme", "ciphertext", "iv"])) {
    return false;
  }
  const candidate = value as Partial<PrivacyKeyCheckV1>;
  return (
    candidate.version === 1 &&
    candidate.scheme === "privacy-key-check" &&
    decodeBase64Exact(candidate.iv, PRIVACY_IV_BYTES) !== null &&
    decodeBase64Bounded(candidate.ciphertext, 17, 256) !== null
  );
}

function isValidRecovery(
  value: unknown,
): value is PrivacyEncryptedRecoveryV1 | null {
  if (value === null) return true;
  if (!isExactObject(value, ["version", "scheme", "ciphertext", "iv"])) {
    return false;
  }
  const candidate = value as Partial<PrivacyEncryptedRecoveryV1>;
  return (
    candidate.version === 1 &&
    candidate.scheme === "privacy-key" &&
    decodeBase64Exact(candidate.iv, PRIVACY_IV_BYTES) !== null &&
    decodeBase64Bounded(
      candidate.ciphertext,
      17,
      MAX_RECOVERY_CIPHERTEXT_BYTES,
    ) !== null
  );
}

function isValidDerivation(value: unknown): boolean {
  if (
    !isExactObject(value, [
      "schema",
      "protocol",
      "phraseStandard",
      "phraseWords",
      "derivationVariant",
    ])
  ) {
    return false;
  }
  const candidate = value as Partial<PrivacyDerivationMetadataV1>;
  return (
    candidate.schema === PRIVACY_DERIVATION_V1.schema &&
    candidate.protocol === PRIVACY_DERIVATION_V1.protocol &&
    candidate.phraseStandard === PRIVACY_DERIVATION_V1.phraseStandard &&
    candidate.phraseWords === PRIVACY_DERIVATION_V1.phraseWords &&
    candidate.derivationVariant === PRIVACY_DERIVATION_V1.derivationVariant
  );
}

export function isValidPrivacyVaultRecord(
  value: unknown,
): value is PrivacyVaultRecordV1 {
  const requiredKeys = [
    "version",
    "keyId",
    "revision",
    "createdAt",
    "derivation",
    "keyCheck",
    "recovery",
  ];
  const hasMasterWrappedKey =
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "masterWrappedKey");
  const hasPasskeyWrappedKey =
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "passkeyWrappedKey");
  const keys = [
    ...requiredKeys,
    ...(hasMasterWrappedKey ? ["masterWrappedKey"] : []),
    ...(hasPasskeyWrappedKey ? ["passkeyWrappedKey"] : []),
  ];
  if (!isExactObject(value, keys)) return false;

  const candidate = value as Partial<PrivacyVaultRecordV1>;
  return (
    candidate.version === PRIVACY_VAULT_VERSION &&
    typeof candidate.keyId === "string" &&
    candidate.keyId.length > 0 &&
    candidate.keyId.length <= MAX_PRIVACY_KEY_ID_LENGTH &&
    Number.isSafeInteger(candidate.revision) &&
    (candidate.revision ?? -1) >= 0 &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    isValidDerivation(candidate.derivation) &&
    (hasMasterWrappedKey || hasPasskeyWrappedKey) &&
    (!hasMasterWrappedKey || isValidMasterWrappedKey(candidate.masterWrappedKey)) &&
    (!hasPasskeyWrappedKey || isValidWrappedKey(candidate.passkeyWrappedKey)) &&
    isValidKeyCheck(candidate.keyCheck) &&
    isValidRecovery(candidate.recovery)
  );
}
