/**
 * Encrypted browser-session persistence for one unified wallet capability.
 *
 * The ciphertext half lives in storage.session and the random AES key lives
 * in storage.local. Browser close removes the ciphertext half. Neither half
 * can restore the wallet alone, and no password or WebAuthn PRF output is
 * persisted.
 */

import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../cryptoUtils";
import { getPasskeySessionBinding } from "../passkey/sessionBinding";
import { loadPasskeyUnlockRecord } from "../passkey/repository";
import type { PasswordType } from "../types";
import { isValidAutoLockTimeout } from "./timeoutValues";
import {
  clearPersistedSessionSecret,
  importSessionEncryptionKey,
  isBoundedSessionId,
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

export const SESSION_CAPABILITY_STORAGE_KEY = "encryptedSessionCapabilities";
export const SESSION_CAPABILITY_VERSION = 1;
const SESSION_CAPABILITY_IV_BYTES = 12;
const SESSION_CAPABILITY_KEY_BYTES = 32;
const SESSION_CAPABILITY_TAG_BYTES = 16;
const MAX_SESSION_SURFACES = 16;
const MAX_FACTOR_BINDING_LENGTH = 128;
const MAX_PRIVACY_KEY_ID_LENGTH = 128;

export type SessionUnlockMethod = "password" | "passkey";
export type SessionLeaseState = "active" | "idle";

interface EncryptedSessionCapabilityV1 {
  version: 1;
  data: string;
  iv: string;
  sessionId: string;
  unlockMethod: SessionUnlockMethod;
  passwordType: PasswordType;
  factorBinding: string;
  autoLockTimeout: number;
  leaseState: SessionLeaseState;
  activeSurfaceIds: string[];
  lastActiveAt: number;
  idleExpiresAt: number | null;
  privacyKeyId: string | null;
}

export interface DecryptedSessionCapability {
  sessionId: string;
  unlockMethod: SessionUnlockMethod;
  passwordType: PasswordType;
  factorBinding: string;
  autoLockTimeout: number;
  leaseState: SessionLeaseState;
  activeSurfaceIds: string[];
  lastActiveAt: number;
  idleExpiresAt: number | null;
  vaultKeyBytes: Uint8Array;
  privacyKeyBytes: Uint8Array | null;
  privacyKeyId: string | null;
}

export interface StoreSessionCapabilityInput {
  sessionId: string;
  unlockMethod: SessionUnlockMethod;
  passwordType: PasswordType;
  vaultKeyBytes: Uint8Array;
  privacyKey?: { keyBytes: Uint8Array; keyId: string } | null;
  autoLockTimeout: number;
  activeSurfaceIds: readonly string[];
  now?: number;
}

function isBoundedSurfaceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function normalizeSurfaceIds(values: readonly string[]): string[] | null {
  if (values.length > MAX_SESSION_SURFACES) return null;
  const normalized = [...new Set(values)];
  return normalized.length === values.length && normalized.every(isBoundedSurfaceId)
    ? normalized.sort()
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function decodeRecord(value: unknown): EncryptedSessionCapabilityV1 | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, [
    "version", "data", "iv", "sessionId", "unlockMethod", "passwordType",
    "factorBinding", "autoLockTimeout", "leaseState", "activeSurfaceIds",
    "lastActiveAt", "idleExpiresAt", "privacyKeyId",
  ])) return null;
  if (
    record.version !== SESSION_CAPABILITY_VERSION ||
    !isBoundedSessionId(record.sessionId) ||
    (record.unlockMethod !== "password" && record.unlockMethod !== "passkey") ||
    (record.passwordType !== "master" && record.passwordType !== "agent") ||
    typeof record.factorBinding !== "string" ||
    record.factorBinding.length === 0 ||
    record.factorBinding.length > MAX_FACTOR_BINDING_LENGTH ||
    !isValidAutoLockTimeout(record.autoLockTimeout) ||
    (record.leaseState !== "active" && record.leaseState !== "idle") ||
    !Array.isArray(record.activeSurfaceIds) ||
    !Number.isSafeInteger(record.lastActiveAt) ||
    (record.lastActiveAt as number) <= 0 ||
    (record.privacyKeyId !== null &&
      (typeof record.privacyKeyId !== "string" ||
        record.privacyKeyId.length === 0 ||
        record.privacyKeyId.length > MAX_PRIVACY_KEY_ID_LENGTH))
  ) return null;
  const surfaceIds = normalizeSurfaceIds(record.activeSurfaceIds as string[]);
  if (!surfaceIds) return null;
  const timeout = record.autoLockTimeout as number;
  const lastActiveAt = record.lastActiveAt as number;
  if (record.leaseState === "active") {
    if (surfaceIds.length === 0 || record.idleExpiresAt !== null) return null;
  } else {
    const expectedExpiry = timeout === 0 ? null : lastActiveAt + timeout;
    if (
      surfaceIds.length !== 0 ||
      record.idleExpiresAt !== expectedExpiry ||
      (expectedExpiry !== null && !Number.isSafeInteger(expectedExpiry))
    ) return null;
  }
  if (!decodeBase64Exact(record.iv, SESSION_CAPABILITY_IV_BYTES)) return null;
  const plaintextBytes = record.privacyKeyId === null
    ? SESSION_CAPABILITY_KEY_BYTES
    : SESSION_CAPABILITY_KEY_BYTES * 2;
  if (!decodeBase64Exact(record.data, plaintextBytes + SESSION_CAPABILITY_TAG_BYTES)) {
    return null;
  }
  return {
    version: 1,
    data: record.data as string,
    iv: record.iv as string,
    sessionId: record.sessionId as string,
    unlockMethod: record.unlockMethod as SessionUnlockMethod,
    passwordType: record.passwordType as PasswordType,
    factorBinding: record.factorBinding as string,
    autoLockTimeout: timeout,
    leaseState: record.leaseState as SessionLeaseState,
    activeSurfaceIds: surfaceIds,
    lastActiveAt,
    idleExpiresAt: record.idleExpiresAt as number | null,
    privacyKeyId: record.privacyKeyId as string | null,
  };
}

function additionalData(record: Omit<EncryptedSessionCapabilityV1, "data" | "iv">): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    "walletchan/session-capabilities/v1",
    record.sessionId,
    record.unlockMethod,
    record.passwordType,
    record.factorBinding,
    record.autoLockTimeout,
    record.leaseState,
    record.activeSurfaceIds,
    record.lastActiveAt,
    record.idleExpiresAt,
    record.privacyKeyId,
  ]));
}

async function hashFactorRecord(
  passwordType: PasswordType,
  value: unknown,
): Promise<string | null> {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.ciphertext !== "string" ||
    typeof record.iv !== "string" ||
    typeof record.salt !== "string"
  ) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([
      "walletchan/password-session-factor/v1",
      passwordType,
      record.ciphertext,
      record.iv,
      record.salt,
    ])),
  );
  return arrayBufferToBase64(digest);
}

export async function getCurrentSessionFactorBinding(
  unlockMethod: SessionUnlockMethod,
  passwordType: PasswordType,
): Promise<string | null> {
  if (unlockMethod === "passkey") {
    if (passwordType !== "master") return null;
    const record = await loadPasskeyUnlockRecord();
    return record ? getPasskeySessionBinding(record) : null;
  }
  const key = passwordType === "master"
    ? "encryptedVaultKeyMaster"
    : "encryptedVaultKeyAgent";
  const stored = await chrome.storage.local.get([key, "agentPasswordEnabled"]);
  if (passwordType === "agent" && stored.agentPasswordEnabled !== true) return null;
  return hashFactorRecord(passwordType, stored[key]);
}

async function encryptCapability(
  capability: Omit<DecryptedSessionCapability, "vaultKeyBytes" | "privacyKeyBytes">,
  vaultKeyBytes: Uint8Array,
  privacyKeyBytes: Uint8Array | null,
  sessionKey: CryptoKey,
): Promise<EncryptedSessionCapabilityV1> {
  const metadata = {
    version: SESSION_CAPABILITY_VERSION,
    sessionId: capability.sessionId,
    unlockMethod: capability.unlockMethod,
    passwordType: capability.passwordType,
    factorBinding: capability.factorBinding,
    autoLockTimeout: capability.autoLockTimeout,
    leaseState: capability.leaseState,
    activeSurfaceIds: capability.activeSurfaceIds,
    lastActiveAt: capability.lastActiveAt,
    idleExpiresAt: capability.idleExpiresAt,
    privacyKeyId: capability.privacyKeyId,
  } satisfies Omit<EncryptedSessionCapabilityV1, "data" | "iv">;
  const plaintext = new Uint8Array(
    SESSION_CAPABILITY_KEY_BYTES + (privacyKeyBytes ? SESSION_CAPABILITY_KEY_BYTES : 0),
  );
  plaintext.set(vaultKeyBytes, 0);
  if (privacyKeyBytes) plaintext.set(privacyKeyBytes, SESSION_CAPABILITY_KEY_BYTES);
  const iv = crypto.getRandomValues(new Uint8Array(SESSION_CAPABILITY_IV_BYTES));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: additionalData(metadata).buffer as ArrayBuffer,
      },
      sessionKey,
      plaintext.buffer as ArrayBuffer,
    );
    return {
      ...metadata,
      data: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    };
  } finally {
    plaintext.fill(0);
  }
}

async function decryptCapability(
  record: EncryptedSessionCapabilityV1,
  sessionKey: CryptoKey,
): Promise<DecryptedSessionCapability | null> {
  const ciphertext = decodeBase64Bounded(
    record.data,
    SESSION_CAPABILITY_KEY_BYTES + SESSION_CAPABILITY_TAG_BYTES,
    SESSION_CAPABILITY_KEY_BYTES * 2 + SESSION_CAPABILITY_TAG_BYTES,
  );
  const iv = decodeBase64Exact(record.iv, SESSION_CAPABILITY_IV_BYTES);
  if (!ciphertext || !iv) return null;
  try {
    const metadata = { ...record };
    delete (metadata as Partial<EncryptedSessionCapabilityV1>).data;
    delete (metadata as Partial<EncryptedSessionCapabilityV1>).iv;
    const plaintext = new Uint8Array(await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: additionalData(metadata).buffer as ArrayBuffer,
      },
      sessionKey,
      ciphertext.buffer as ArrayBuffer,
    ));
    const expectedLength = record.privacyKeyId === null ? 32 : 64;
    if (plaintext.byteLength !== expectedLength) {
      plaintext.fill(0);
      return null;
    }
    const vaultKeyBytes = plaintext.slice(0, 32);
    const privacyKeyBytes = record.privacyKeyId === null
      ? null
      : plaintext.slice(32, 64);
    plaintext.fill(0);
    return {
      sessionId: record.sessionId,
      unlockMethod: record.unlockMethod,
      passwordType: record.passwordType,
      factorBinding: record.factorBinding,
      autoLockTimeout: record.autoLockTimeout,
      leaseState: record.leaseState,
      activeSurfaceIds: [...record.activeSurfaceIds],
      lastActiveAt: record.lastActiveAt,
      idleExpiresAt: record.idleExpiresAt,
      vaultKeyBytes,
      privacyKeyBytes,
      privacyKeyId: record.privacyKeyId,
    };
  } catch {
    return null;
  }
}

export async function readSessionCapability(): Promise<DecryptedSessionCapability | null> {
  if (!hasNativeSessionStorage()) return null;
  await waitForLegacySessionCleanup();
  const [session, local] = await Promise.all([
    getSessionItems<unknown>(SESSION_CAPABILITY_STORAGE_KEY),
    chrome.storage.local.get(SESSION_KEY_LOCAL),
  ]);
  const record = decodeRecord(session[SESSION_CAPABILITY_STORAGE_KEY]);
  const key = await importSessionEncryptionKey(local[SESSION_KEY_LOCAL]);
  if (!record || !key) return null;
  return decryptCapability(record, key);
}

export async function storeSessionCapabilityAtomic(
  input: StoreSessionCapabilityInput,
): Promise<void> {
  await waitForLegacySessionCleanup();
  const now = input.now ?? Date.now();
  const activeSurfaceIds = normalizeSurfaceIds(input.activeSurfaceIds);
  const factorBinding = await getCurrentSessionFactorBinding(
    input.unlockMethod,
    input.passwordType,
  );
  if (
    !hasNativeSessionStorage() ||
    !isBoundedSessionId(input.sessionId) ||
    !factorBinding ||
    input.vaultKeyBytes.byteLength !== SESSION_CAPABILITY_KEY_BYTES ||
    !isValidAutoLockTimeout(input.autoLockTimeout) ||
    !Number.isSafeInteger(now) || now <= 0 ||
    !activeSurfaceIds ||
    (input.passwordType === "agent" && input.privacyKey) ||
    (input.privacyKey &&
      (input.privacyKey.keyBytes.byteLength !== SESSION_CAPABILITY_KEY_BYTES ||
        input.privacyKey.keyId.length === 0 ||
        input.privacyKey.keyId.length > MAX_PRIVACY_KEY_ID_LENGTH))
  ) {
    await clearPersistedSessionSecret();
    if (!hasNativeSessionStorage()) {
      await setSessionItems({
        sessionId: input.sessionId,
        sessionStartedAt: now,
        autoLockNever: false,
        passwordType: input.passwordType,
      });
      return;
    }
    throw new Error("Session capability is invalid");
  }
  const leaseState: SessionLeaseState = activeSurfaceIds.length > 0 ? "active" : "idle";
  const idleExpiresAt = leaseState === "active" || input.autoLockTimeout === 0
    ? null
    : now + input.autoLockTimeout;
  if (idleExpiresAt !== null && !Number.isSafeInteger(idleExpiresAt)) {
    throw new Error("Session capability timing is invalid");
  }
  const sessionKeyBytes = crypto.getRandomValues(new Uint8Array(SESSION_KEY_BYTES));
  try {
    const sessionKey = await crypto.subtle.importKey(
      "raw", sessionKeyBytes, "AES-GCM", false, ["encrypt"],
    );
    const encrypted = await encryptCapability({
      sessionId: input.sessionId,
      unlockMethod: input.unlockMethod,
      passwordType: input.passwordType,
      factorBinding,
      autoLockTimeout: input.autoLockTimeout,
      leaseState,
      activeSurfaceIds,
      lastActiveAt: now,
      idleExpiresAt,
      privacyKeyId: input.privacyKey?.keyId ?? null,
    }, input.vaultKeyBytes, input.privacyKey?.keyBytes ?? null, sessionKey);

    await clearPersistedSessionSecret();
    await setSessionItems({
      sessionId: input.sessionId,
      sessionStartedAt: now,
      autoLockNever: input.autoLockTimeout === 0,
      passwordType: input.passwordType,
      [SESSION_CAPABILITY_STORAGE_KEY]: encrypted,
    });
    await chrome.storage.local.set({
      [SESSION_KEY_LOCAL]: arrayBufferToBase64(sessionKeyBytes.buffer as ArrayBuffer),
    });
  } finally {
    sessionKeyBytes.fill(0);
  }
}

async function rewriteCapability(
  capability: DecryptedSessionCapability,
  mutate: (current: DecryptedSessionCapability) => void,
): Promise<boolean> {
  const local = await chrome.storage.local.get(SESSION_KEY_LOCAL);
  const sessionKey = await importSessionEncryptionKey(local[SESSION_KEY_LOCAL]);
  if (!sessionKey) return false;
  mutate(capability);
  const encrypted = await encryptCapability(
    capability,
    capability.vaultKeyBytes,
    capability.privacyKeyBytes,
    sessionKey,
  );
  await setSessionItems({ [SESSION_CAPABILITY_STORAGE_KEY]: encrypted });
  return true;
}

export async function updateSessionCapabilityLease(
  activeSurfaceIdsInput: readonly string[],
  now = Date.now(),
): Promise<boolean> {
  const activeSurfaceIds = normalizeSurfaceIds(activeSurfaceIdsInput);
  if (!activeSurfaceIds || !Number.isSafeInteger(now) || now <= 0) return false;
  const capability = await readSessionCapability();
  if (!capability) return false;
  try {
    return await rewriteCapability(capability, (current) => {
      current.activeSurfaceIds = activeSurfaceIds;
      current.leaseState = activeSurfaceIds.length > 0 ? "active" : "idle";
      current.lastActiveAt = now;
      current.idleExpiresAt = current.leaseState === "active" || current.autoLockTimeout === 0
        ? null
        : now + current.autoLockTimeout;
    });
  } finally {
    capability.vaultKeyBytes.fill(0);
    capability.privacyKeyBytes?.fill(0);
  }
}

export async function addPrivacyKeyToSessionCapability(
  privacy: { keyBytes: Uint8Array; keyId: string },
): Promise<boolean> {
  if (privacy.keyBytes.byteLength !== 32 || !isBoundedSurfaceId(privacy.keyId)) {
    return false;
  }
  const capability = await readSessionCapability();
  if (!capability || capability.passwordType !== "master") return false;
  try {
    const currentBinding = await getCurrentSessionFactorBinding(
      capability.unlockMethod,
      capability.passwordType,
    );
    if (!currentBinding) return false;
    return await rewriteCapability(capability, (current) => {
      current.factorBinding = currentBinding;
      current.privacyKeyBytes?.fill(0);
      current.privacyKeyBytes = new Uint8Array(privacy.keyBytes);
      current.privacyKeyId = privacy.keyId;
    });
  } finally {
    capability.vaultKeyBytes.fill(0);
    capability.privacyKeyBytes?.fill(0);
  }
}

export async function removeUnifiedSessionCapability(): Promise<void> {
  await removeSessionItems(SESSION_CAPABILITY_STORAGE_KEY);
}
