/** Bounded persisted record for a Never-mode passkey vault capability. */

import {
  decodeBase64Exact,
} from "../cryptoUtils";

export const PASSKEY_SESSION_CREDENTIAL_VERSION = 1;
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

export interface DecodedPasskeySessionCredential {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  passkeyBinding: string;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

export function decodePasskeySessionCredential(
  value: unknown,
): DecodedPasskeySessionCredential | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, [
      "version",
      "data",
      "iv",
      "passkeyBinding",
    ]) ||
    candidate.version !== PASSKEY_SESSION_CREDENTIAL_VERSION
  ) {
    return null;
  }

  const ciphertext = decodeBase64Exact(
    candidate.data,
    PASSKEY_SESSION_VAULT_KEY_BYTES + PASSKEY_SESSION_TAG_BYTES,
  );
  const iv = decodeBase64Exact(candidate.iv, PASSKEY_SESSION_IV_BYTES);
  const binding = decodeBase64Exact(
    candidate.passkeyBinding,
    PASSKEY_SESSION_BINDING_BYTES,
  );
  if (!ciphertext || !iv || !binding) return null;

  return {
    ciphertext,
    iv,
    passkeyBinding: candidate.passkeyBinding as string,
  };
}
