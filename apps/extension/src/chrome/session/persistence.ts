/**
 * Encrypted native-session password persistence for explicit Never auto-lock.
 *
 * This layer owns the split AES-GCM envelope only. It has no dependency on the
 * in-memory cache, auth transitions, unlock handlers, or the session facade.
 * Browsers without native storage.session persist non-secret metadata only.
 */

import { isBoundedExistingPassword } from "@/constants/securityPolicy";
import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../cryptoUtils";
import {
  cleanupLegacyLocalSessionFallback,
  clearSession,
  getSessionItems,
  hasNativeSessionStorage,
  removeSessionItems,
  setSessionItems,
} from "./storage";
import type { PasswordType } from "../types";
import { importSessionEncryptionKey, SESSION_KEY_BYTES } from "./sessionEncryptionKey";

export const SESSION_KEY_LOCAL = "sessionEncKey";
export { importSessionEncryptionKey, SESSION_KEY_BYTES } from "./sessionEncryptionKey";
const SESSION_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const MAX_SESSION_PASSWORD_BYTES = 1024 * 1024;
export const SESSION_CREDENTIAL_KIND_PASSWORD = "password";
export const SESSION_CREDENTIAL_KIND_PASSKEY = "passkey-vault";

const legacySessionCleanup =
  typeof chrome === "undefined"
    ? Promise.resolve()
    : cleanupLegacyLocalSessionFallback(SESSION_KEY_LOCAL);
void legacySessionCleanup.catch((error) => {
  console.error("Failed to clean up legacy local session state:", error);
});

export async function waitForLegacySessionCleanup(): Promise<void> {
  await legacySessionCleanup;
}

async function revokeSplitSessionSecret(
  removeSessionHalf: () => Promise<void>,
): Promise<void> {
  let recoveryKeyRemovalFailed = false;
  try {
    // Revoke the durable half first. Once this resolves, a worker termination
    // cannot leave the browser-session ciphertext restorable.
    await chrome.storage.local.remove(SESSION_KEY_LOCAL);
  } catch {
    recoveryKeyRemovalFailed = true;
  }

  try {
    // Always attempt the other half, including after a local-storage failure.
    await removeSessionHalf();
  } catch {
    if (recoveryKeyRemovalFailed) {
      throw new Error("Failed to revoke persisted session capability");
    }
  }
}

export async function clearPersistedSessionSecret(): Promise<void> {
  await revokeSplitSessionSecret(() =>
    removeSessionItems([
      "encryptedSessionPassword",
      "encryptedSessionVaultKey",
      "sessionCredentialKind",
    ]),
  );
}

/**
 * Destroy the durable recovery half before removing an authentication factor.
 * Once this resolves, any remaining session ciphertext is non-restorable.
 */
export async function revokePersistedSessionRecoveryKey(): Promise<void> {
  await legacySessionCleanup;
  await chrome.storage.local.remove(SESSION_KEY_LOCAL);
}

export async function readPersistedSessionRecord(): Promise<
  Record<string, unknown>
> {
  return getSessionItems<unknown>([
    "sessionId",
    "sessionStartedAt",
    "autoLockNever",
    "encryptedSessionPassword",
    "encryptedSessionVaultKey",
    "sessionCredentialKind",
    "passwordType",
  ]);
}

export function isBoundedSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export async function getSessionPassword(): Promise<string | null> {
  if (!hasNativeSessionStorage()) return null;
  await legacySessionCleanup;
  const [session, local] = await Promise.all([
    getSessionItems<unknown>([
      "sessionCredentialKind",
      "encryptedSessionPassword",
    ]),
    chrome.storage.local.get(SESSION_KEY_LOCAL),
  ]);

  if (
    session.sessionCredentialKind !== SESSION_CREDENTIAL_KIND_PASSWORD ||
    !session.encryptedSessionPassword ||
    !local[SESSION_KEY_LOCAL]
  ) {
    return null;
  }

  try {
    const encryptedRecord = session.encryptedSessionPassword;
    if (typeof encryptedRecord !== "object" || encryptedRecord === null) {
      return null;
    }
    const { data, iv: ivB64 } = encryptedRecord as Record<string, unknown>;
    const encryptedData = decodeBase64Bounded(
      data,
      AES_GCM_TAG_BYTES,
      MAX_SESSION_PASSWORD_BYTES + AES_GCM_TAG_BYTES,
    );
    const iv = decodeBase64Exact(ivB64, SESSION_IV_BYTES);
    const key = await importSessionEncryptionKey(local[SESSION_KEY_LOCAL]);
    if (!encryptedData || !key || !iv) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      encryptedData.buffer as ArrayBuffer,
    );

    if (decrypted.byteLength > MAX_SESSION_PASSWORD_BYTES) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
  } catch {
    return null;
  }
}

export async function clearPersistedSessionStorage(): Promise<void> {
  await legacySessionCleanup;
  await revokeSplitSessionSecret(clearSession);
}

export async function storeSessionAtomic(
  sessionId: string,
  isUnlocked: boolean,
  passwordType: PasswordType,
  password: string,
): Promise<void> {
  await legacySessionCleanup;
  if (!isBoundedExistingPassword(password)) {
    await clearPersistedSessionSecret();
    throw new Error("Session password is invalid");
  }

  if (!hasNativeSessionStorage()) {
    await clearPersistedSessionSecret();
    await setSessionItems({
      sessionId,
      sessionStartedAt: Date.now(),
      autoLockNever: false,
      sessionCredentialKind: SESSION_CREDENTIAL_KIND_PASSWORD,
      passwordType,
    });
    return;
  }

  const sessionKey = crypto.getRandomValues(new Uint8Array(SESSION_KEY_BYTES));
  try {
    const iv = crypto.getRandomValues(new Uint8Array(SESSION_IV_BYTES));
    const key = await crypto.subtle.importKey(
      "raw",
      sessionKey,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(password),
    );

    await removeSessionItems("encryptedSessionVaultKey");
    await setSessionItems({
      sessionId,
      sessionStartedAt: Date.now(),
      autoLockNever: isUnlocked,
      sessionCredentialKind: SESSION_CREDENTIAL_KIND_PASSWORD,
      passwordType,
      encryptedSessionPassword: {
        data: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      },
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
