/** Bounded persisted records for passkey vault session capabilities. */

import {
  decodeBase64Exact,
} from "../cryptoUtils";
import { isValidAutoLockTimeout } from "./timeoutValues";
import {
  PASSKEY_SESSION_BINDING_BYTES,
  PASSKEY_SESSION_IV_BYTES,
  PASSKEY_SESSION_TAG_BYTES,
  PASSKEY_SESSION_VAULT_KEY_BYTES,
  type DecodedPasskeySessionCredential,
} from "./passkeyCredentialTypes";
import { getPasskeyCredentialVersion } from "./passkeyCredentialShape";
export * from "./passkeyCredentialTypes";

export function decodePasskeySessionCredential(
  value: unknown,
): DecodedPasskeySessionCredential | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const version = getPasskeyCredentialVersion(candidate);
  if (!version) return null;

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

  if (version === 2) {
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
