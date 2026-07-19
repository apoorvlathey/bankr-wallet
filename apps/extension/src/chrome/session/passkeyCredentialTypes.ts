export const PASSKEY_SESSION_CREDENTIAL_VERSION = 2;
export const PASSKEY_SESSION_VAULT_KEY_BYTES = 32;
export const PASSKEY_SESSION_IV_BYTES = 12;
export const PASSKEY_SESSION_TAG_BYTES = 16;
export const PASSKEY_SESSION_BINDING_BYTES = 32;

export interface EncryptedPasskeySessionCredentialV1 {
  version: 1;
  data: string;
  iv: string;
  passkeyBinding: string;
}

export interface EncryptedPasskeySessionCredentialV2 {
  version: 2;
  data: string;
  iv: string;
  passkeyBinding: string;
  startedAt: number;
  autoLockTimeout: number;
  expiresAt: number | null;
}

export type EncryptedPasskeySessionCredential =
  | EncryptedPasskeySessionCredentialV1
  | EncryptedPasskeySessionCredentialV2;

export interface DecodedPasskeySessionCredential {
  version: 1 | 2;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  passkeyBinding: string;
  startedAt: number | null;
  autoLockTimeout: number;
  expiresAt: number | null;
}
