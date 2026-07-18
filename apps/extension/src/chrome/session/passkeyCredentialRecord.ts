/** Bounded persisted records for passkey vault session capabilities. */

import {
  decodeBase64Exact,
} from "../cryptoUtils";
import { isValidAutoLockTimeout } from "./timeoutValues";

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
  const isV1 =
    candidate.version === 1 &&
    hasExactKeys(candidate, ["version", "data", "iv", "passkeyBinding"]);
  const isV2 =
    candidate.version === PASSKEY_SESSION_CREDENTIAL_VERSION &&
    hasExactKeys(candidate, [
      "version",
      "data",
      "iv",
      "passkeyBinding",
      "startedAt",
      "autoLockTimeout",
      "expiresAt",
    ]);
  if (!isV1 && !isV2) {
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

  if (isV2) {
    const { startedAt, autoLockTimeout, expiresAt } = candidate;
    if (
      !Number.isSafeInteger(startedAt) ||
      (startedAt as number) <= 0 ||
      !isValidAutoLockTimeout(autoLockTimeout) ||
      (autoLockTimeout === 0
        ? expiresAt !== null
        : !Number.isSafeInteger(expiresAt) ||
          (expiresAt as number) !==
            (startedAt as number) + autoLockTimeout)
    ) {
      return null;
    }

    return {
      version: 2,
      ciphertext,
      iv,
      passkeyBinding: candidate.passkeyBinding as string,
      startedAt: startedAt as number,
      autoLockTimeout,
      expiresAt: expiresAt as number | null,
    };
  }

  return {
    version: 1,
    ciphertext,
    iv,
    passkeyBinding: candidate.passkeyBinding as string,
    startedAt: null,
    autoLockTimeout: 0,
    expiresAt: null,
  };
}
