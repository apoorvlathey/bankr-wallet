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

const SESSION_KEY_LOCAL = "sessionEncKey";
const SESSION_KEY_BYTES = 32;
const SESSION_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const MAX_SESSION_PASSWORD_BYTES = 1024 * 1024;

const legacySessionCleanup =
  typeof chrome === "undefined"
    ? Promise.resolve()
    : cleanupLegacyLocalSessionFallback(SESSION_KEY_LOCAL);
void legacySessionCleanup.catch((error) => {
  console.error("Failed to clean up legacy local session state:", error);
});

async function clearPersistedSessionSecret(): Promise<void> {
  await Promise.all([
    removeSessionItems("encryptedSessionPassword"),
    chrome.storage.local.remove(SESSION_KEY_LOCAL),
  ]);
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
    "autoLockNever",
    "encryptedSessionPassword",
    "passwordType",
  ]);
}

export async function getSessionPassword(): Promise<string | null> {
  if (!hasNativeSessionStorage()) return null;
  await legacySessionCleanup;
  const [session, local] = await Promise.all([
    getSessionItems<{ data: string; iv: string }>(
      "encryptedSessionPassword",
    ),
    chrome.storage.local.get(SESSION_KEY_LOCAL),
  ]);

  if (!session.encryptedSessionPassword || !local[SESSION_KEY_LOCAL]) {
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
    const sessionKey = decodeBase64Exact(
      local[SESSION_KEY_LOCAL],
      SESSION_KEY_BYTES,
    );
    const iv = decodeBase64Exact(ivB64, SESSION_IV_BYTES);
    if (!encryptedData || !sessionKey || !iv) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      sessionKey.buffer as ArrayBuffer,
      "AES-GCM",
      false,
      ["decrypt"],
    );
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
  await Promise.all([
    clearSession(),
    chrome.storage.local.remove(SESSION_KEY_LOCAL),
  ]);
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
      passwordType,
    });
    return;
  }

  const sessionKey = crypto.getRandomValues(new Uint8Array(SESSION_KEY_BYTES));
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

  await setSessionItems({
    sessionId,
    sessionStartedAt: Date.now(),
    autoLockNever: isUnlocked,
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
}
