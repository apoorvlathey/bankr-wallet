/** Released passkey V1/V2 session-envelope migration compatibility. */

import { arrayBufferToBase64, decodeBase64Exact } from "../cryptoUtils";
import { isValidAutoLockTimeout } from "./timeoutValues";
import {
  decodePasskeySessionCredential,
  PASSKEY_SESSION_BINDING_BYTES,
  PASSKEY_SESSION_CREDENTIAL_VERSION,
  PASSKEY_SESSION_IV_BYTES,
  PASSKEY_SESSION_VAULT_KEY_BYTES,
  type DecodedPasskeySessionCredential,
  type EncryptedPasskeySessionCredentialV2,
} from "./passkeyCredentialRecord";
import {
  clearPersistedSessionSecret,
  importSessionEncryptionKey,
  isBoundedSessionId,
  SESSION_CREDENTIAL_KIND_PASSKEY,
  SESSION_KEY_BYTES,
  SESSION_KEY_LOCAL,
  waitForLegacySessionCleanup,
} from "./persistence";
import {
  getSessionItems,
  hasNativeSessionStorage,
  removeSessionItems,
  setSessionItems,
} from "./storage";

export interface PersistedPasskeySessionCredential {
  kind: "passkey-vault";
  vaultKeyBytes: Uint8Array;
  passkeyBinding: string;
  startedAt: number | null;
  autoLockTimeout: number;
  expiresAt: number | null;
}

export interface PasskeySessionTiming {
  autoLockTimeout: number;
  startedAt?: number;
  expiresAt?: number | null;
}

function passkeySessionAdditionalData(
  sessionId: string,
  record: Pick<
    DecodedPasskeySessionCredential,
    | "version"
    | "passkeyBinding"
    | "startedAt"
    | "autoLockTimeout"
    | "expiresAt"
  >,
): Uint8Array {
  if (record.version === 1) {
    return new TextEncoder().encode(
      JSON.stringify([
        "walletchan/passkey-session/v1",
        sessionId,
        "master",
        record.passkeyBinding,
      ]),
    );
  }
  return new TextEncoder().encode(
    JSON.stringify([
      "walletchan/passkey-session/v2",
      sessionId,
      "master",
      record.passkeyBinding,
      record.startedAt,
      record.autoLockTimeout,
      record.expiresAt,
    ]),
  );
}

function resolvePasskeySessionTiming(
  timing: PasskeySessionTiming,
): { startedAt: number; autoLockTimeout: number; expiresAt: number | null } | null {
  if (!isValidAutoLockTimeout(timing.autoLockTimeout)) return null;
  const startedAt = timing.startedAt ?? Date.now();
  const expiresAt =
    timing.expiresAt ??
    (timing.autoLockTimeout === 0
      ? null
      : startedAt + timing.autoLockTimeout);
  if (
    !Number.isSafeInteger(startedAt) ||
    startedAt <= 0 ||
    (timing.autoLockTimeout === 0
      ? expiresAt !== null
      : !Number.isSafeInteger(expiresAt) ||
        expiresAt !== startedAt + timing.autoLockTimeout)
  ) {
    return null;
  }
  return { startedAt, autoLockTimeout: timing.autoLockTimeout, expiresAt };
}

export async function getSessionPasskeyCredential(
  sessionId: string,
): Promise<PersistedPasskeySessionCredential | null> {
  if (!hasNativeSessionStorage() || !isBoundedSessionId(sessionId)) return null;
  await waitForLegacySessionCleanup();
  const [session, local] = await Promise.all([
    getSessionItems<unknown>([
      "sessionCredentialKind",
      "encryptedSessionVaultKey",
    ]),
    chrome.storage.local.get(SESSION_KEY_LOCAL),
  ]);
  if (
    session.sessionCredentialKind !== SESSION_CREDENTIAL_KIND_PASSKEY ||
    !local[SESSION_KEY_LOCAL]
  ) {
    return null;
  }

  const record = decodePasskeySessionCredential(
    session.encryptedSessionVaultKey,
  );
  const key = await importSessionEncryptionKey(local[SESSION_KEY_LOCAL]);
  if (!record || !key) return null;

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: record.iv.buffer as ArrayBuffer,
        additionalData: passkeySessionAdditionalData(
          sessionId,
          record,
        ).buffer as ArrayBuffer,
      },
      key,
      record.ciphertext.buffer as ArrayBuffer,
    );
    const vaultKeyBytes = new Uint8Array(plaintext);
    if (vaultKeyBytes.byteLength !== PASSKEY_SESSION_VAULT_KEY_BYTES) {
      vaultKeyBytes.fill(0);
      return null;
    }
    return {
      kind: SESSION_CREDENTIAL_KIND_PASSKEY,
      vaultKeyBytes,
      passkeyBinding: record.passkeyBinding,
      startedAt: record.startedAt,
      autoLockTimeout: record.autoLockTimeout,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function storePasskeySessionAtomic(
  sessionId: string,
  vaultKeyBytes: Uint8Array,
  passkeyBinding: string,
  timing: PasskeySessionTiming = { autoLockTimeout: 0 },
): Promise<void> {
  await waitForLegacySessionCleanup();
  const resolvedTiming = resolvePasskeySessionTiming(timing);
  if (
    !isBoundedSessionId(sessionId) ||
    vaultKeyBytes.byteLength !== PASSKEY_SESSION_VAULT_KEY_BYTES ||
    !decodeBase64Exact(passkeyBinding, PASSKEY_SESSION_BINDING_BYTES) ||
    !resolvedTiming
  ) {
    await clearPersistedSessionSecret();
    throw new Error("Passkey session capability is invalid");
  }

  if (!hasNativeSessionStorage()) {
    await clearPersistedSessionSecret();
    await setSessionItems({
      sessionId,
      sessionStartedAt: resolvedTiming.startedAt,
      autoLockNever: false,
      sessionCredentialKind: SESSION_CREDENTIAL_KIND_PASSKEY,
      passwordType: "master",
    });
    return;
  }

  const sessionKey = crypto.getRandomValues(new Uint8Array(SESSION_KEY_BYTES));
  try {
    const iv = crypto.getRandomValues(
      new Uint8Array(PASSKEY_SESSION_IV_BYTES),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      sessionKey,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const plaintextCopy = new Uint8Array(vaultKeyBytes);
    let encrypted: ArrayBuffer;
    try {
      encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: passkeySessionAdditionalData(
            sessionId,
            {
              version: 2,
              passkeyBinding,
              ...resolvedTiming,
            },
          ).buffer as ArrayBuffer,
        },
        key,
        plaintextCopy.buffer as ArrayBuffer,
      );
    } finally {
      plaintextCopy.fill(0);
    }
    const encryptedSessionVaultKey: EncryptedPasskeySessionCredentialV2 = {
      version: PASSKEY_SESSION_CREDENTIAL_VERSION,
      data: arrayBufferToBase64(encrypted),
      iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      passkeyBinding,
      ...resolvedTiming,
    };

    await removeSessionItems("encryptedSessionPassword");
    await setSessionItems({
      sessionId,
      sessionStartedAt: resolvedTiming.startedAt,
      autoLockNever: resolvedTiming.autoLockTimeout === 0,
      sessionCredentialKind: SESSION_CREDENTIAL_KIND_PASSKEY,
      passwordType: "master",
      encryptedSessionVaultKey,
    });
    await chrome.storage.local.set({
      [SESSION_KEY_LOCAL]: arrayBufferToBase64(
        sessionKey.buffer as ArrayBuffer,
      ),
    });
  } finally {
    sessionKey.fill(0);
  }
}
