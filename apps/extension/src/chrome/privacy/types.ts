import type { EncryptedData } from "../crypto";

export interface PrivacyDerivationMetadataV1 {
  schema: "walletchan-privacy-root-v1";
  protocol: "privacy-pools-v1";
  phraseStandard: "bip39-english-128";
  phraseWords: 12;
  derivationVariant: "safe-bigint-v1";
}

export interface PrivacyWrappedKey {
  ciphertext: string;
  iv: string;
}

export interface PrivacyEncryptedRecoveryV1 {
  version: 1;
  scheme: "privacy-key";
  ciphertext: string;
  iv: string;
}

export interface PrivacyKeyCheckV1 {
  version: 1;
  scheme: "privacy-key-check";
  ciphertext: string;
  iv: string;
}

export interface PrivacyVaultRecordV1 {
  version: 1;
  keyId: string;
  revision: number;
  createdAt: number;
  derivation: PrivacyDerivationMetadataV1;
  masterWrappedKey?: EncryptedData;
  passkeyWrappedKey?: PrivacyWrappedKey;
  keyCheck: PrivacyKeyCheckV1;
  recovery: PrivacyEncryptedRecoveryV1 | null;
}

export type PrivacyInitializationStatus =
  | { success: true; status: "ready" }
  | {
      success: false;
      status: "action-required";
      code: "auth-required" | "account-required" | "recovery-required";
      error: string;
    };

export interface UnlockedPrivacyKey {
  key: CryptoKey;
  keyBytes: Uint8Array;
  keyId: string;
}
