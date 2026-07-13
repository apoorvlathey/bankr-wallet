/**
 * Compatibility facade for background authentication session state.
 *
 * Public callers continue to import this module. Cohesive implementation
 * layers have one-way dependencies:
 * - session/inMemoryCache.ts owns decrypted capabilities and timestamps
 * - session/autoLockPolicy.ts owns timeout normalization and its storage cache
 * - session/persistence.ts owns the encrypted native Never-session envelope
 *
 * This facade alone coordinates those layers with serialized auth transitions.
 */

import type { DecryptedEntry, PasswordType } from "./types";
import type { CachedMnemonicKey } from "./session/inMemoryCache";
import * as memoryCache from "./session/inMemoryCache";
import {
  AUTO_LOCK_STORAGE_KEY,
  DEFAULT_AUTO_LOCK_TIMEOUT,
  VALID_AUTO_LOCK_TIMEOUTS,
  getAutoLockTimeout as getStoredOrCachedAutoLockTimeout,
  getEffectiveCachedAutoLockTimeout,
  isValidAutoLockTimeout,
  normalizeAutoLockTimeout,
  readRawStoredAutoLockTimeout,
  readStoredAutoLockTimeout,
  setCachedAutoLockTimeout,
  updateCachedAutoLockTimeout,
  writeAutoLockTimeout,
} from "./session/autoLockPolicy";
import {
  clearPersistedSessionStorage,
  getSessionPassword,
  readPersistedSessionRecord,
  storeSessionAtomic as persistSessionAtomic,
} from "./session/persistence";
import {
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
} from "./authTransition";

export type { CachedMnemonicKey } from "./session/inMemoryCache";
export {
  AUTO_LOCK_STORAGE_KEY,
  DEFAULT_AUTO_LOCK_TIMEOUT,
  VALID_AUTO_LOCK_TIMEOUTS,
  updateCachedAutoLockTimeout,
} from "./session/autoLockPolicy";
export {
  clearInMemoryAuthCache,
  decrementUIConnections,
  getCurrentSessionId,
  incrementUIConnections,
  setCachedApiKey,
  setCachedApiKeyDirect,
  setCachedMnemonicKey,
  setCachedPasswordDirect,
  setCachedPasswordType,
  setCachedVault,
  setCachedVaultKey,
  setCurrentSessionId,
} from "./session/inMemoryCache";
export {
  getSessionPassword,
  storeSessionAtomic,
} from "./session/persistence";

type UnlockFn = (
  password: string,
) => Promise<{ success: boolean; passwordType?: PasswordType }>;

function effectiveTimeout(): number {
  return getEffectiveCachedAutoLockTimeout();
}

export async function getAutoLockTimeout(): Promise<number> {
  return getStoredOrCachedAutoLockTimeout();
}

export async function initializeAutoLockTimeoutDefault(): Promise<void> {
  const value = await readRawStoredAutoLockTimeout();
  if (isValidAutoLockTimeout(value)) return;

  // Missing/invalid settings used to behave like an implicit Never session.
  // Remove both halves of any dormant recovery envelope before installing the
  // finite default. An explicit valid zero remains untouched above.
  await clearSessionStorage();
  await writeAutoLockTimeout(DEFAULT_AUTO_LOCK_TIMEOUT);
}

export async function setAutoLockTimeout(timeout: number): Promise<boolean> {
  if (!VALID_AUTO_LOCK_TIMEOUTS.has(timeout)) return false;

  // Storage, not a potentially cold cache, is authoritative for a 0 -> timed
  // transition because that transition must destroy restorable session state.
  const previousTimeout = await readStoredAutoLockTimeout();
  await writeAutoLockTimeout(timeout);

  if (timeout !== 0 && previousTimeout === 0) {
    await clearSessionStorage();
  } else if (
    timeout === 0 &&
    previousTimeout !== 0 &&
    (getCachedApiKey() !== null || getCachedVault() !== null)
  ) {
    const password = getCachedPassword();
    const passwordType = getPasswordType();
    if (password && passwordType) {
      const sessionId = crypto.randomUUID();
      memoryCache.setCurrentSessionId(sessionId);
      await persistSessionAtomic(sessionId, true, passwordType, password);
    }
  }

  return true;
}

export async function handleAutoLockTimeoutStorageChange(
  oldValue: unknown,
  newValue: unknown,
): Promise<void> {
  const previousTimeout = normalizeAutoLockTimeout(oldValue);
  const nextTimeout = normalizeAutoLockTimeout(newValue);
  setCachedAutoLockTimeout(nextTimeout);
  if (previousTimeout === 0 && nextTimeout !== 0) {
    await runSerializedAuthTransition(() => clearSessionStorage());
  }
}

export function getCachedApiKey(): string | null {
  return memoryCache.getCachedApiKey(effectiveTimeout());
}

export function getCachedPassword(): string | null {
  return memoryCache.getCachedPassword(effectiveTimeout());
}

export function getCachedVault(): DecryptedEntry[] | null {
  return memoryCache.getCachedVault(effectiveTimeout());
}

export function getCachedVaultKey(): CryptoKey | null {
  return memoryCache.getCachedVaultKey(effectiveTimeout());
}

export function getCachedMnemonicKey(): CachedMnemonicKey | null {
  return memoryCache.getCachedMnemonicKey(effectiveTimeout());
}

export function getPasswordType(): PasswordType | null {
  return memoryCache.getPasswordType(effectiveTimeout());
}

export async function resolvePasswordType(
  unlockFn: UnlockFn,
  authTransitionAlreadySerialized = false,
): Promise<PasswordType | null> {
  const cached = getPasswordType();
  if (cached !== null) return cached;

  if ((await getAutoLockTimeout()) !== 0) return null;

  if (authTransitionAlreadySerialized) {
    await tryRestoreSessionAlreadySerialized(unlockFn);
  } else {
    await tryRestoreSession(unlockFn);
  }
  return getPasswordType();
}

export async function clearSessionStorage(): Promise<void> {
  memoryCache.setCurrentSessionId(null);
  await clearPersistedSessionStorage();
}

async function restoreSessionWithinAuthTransition(
  unlockFn: UnlockFn,
): Promise<boolean> {
  // Re-read the authoritative setting inside the serialized primitive. A
  // stale cache or tampered session record cannot turn a timed setting into a
  // restorable Never session.
  const timeout = await readStoredAutoLockTimeout();
  setCachedAutoLockTimeout(timeout);
  if (timeout !== 0) {
    await clearSessionStorage();
    return false;
  }

  const session = await readPersistedSessionRecord();
  const sessionId =
    typeof session.sessionId === "string" ? session.sessionId : null;
  const persistedPasswordType =
    session.passwordType === "master" || session.passwordType === "agent"
      ? session.passwordType
      : undefined;

  if (
    !sessionId ||
    session.autoLockNever !== true ||
    !session.encryptedSessionPassword
  ) {
    return false;
  }

  try {
    const password = await getSessionPassword();
    if (!password) {
      await clearSessionStorage();
      return false;
    }

    const result = await unlockFn(password);
    if (!result.success || !result.passwordType) {
      await clearAllAuthState();
      return false;
    }

    const currentTimeout = await readStoredAutoLockTimeout();
    setCachedAutoLockTimeout(currentTimeout);
    if (currentTimeout !== 0) {
      await clearAllAuthState();
      return false;
    }

    // The wrapper that actually decrypted is authoritative. Persisted metadata
    // may only confirm it; it can never upgrade an agent session to master.
    if (
      persistedPasswordType &&
      persistedPasswordType !== result.passwordType
    ) {
      await clearAllAuthState();
      return false;
    }

    const resolvedPasswordType = result.passwordType;
    memoryCache.setCurrentSessionId(sessionId);
    memoryCache.setCachedPasswordType(resolvedPasswordType);
    await persistSessionAtomic(
      sessionId,
      true,
      resolvedPasswordType,
      password,
    );

    invalidateAuthCeremonies();
    console.log("Session restored successfully after service worker restart");
    return true;
  } catch (error) {
    console.error("Failed to restore session:", error);
    await clearAllAuthState().catch(() => {
      memoryCache.clearInMemoryAuthCache();
    });
    return false;
  }
}

export function tryRestoreSession(unlockFn: UnlockFn): Promise<boolean> {
  return runSerializedAuthTransition(() =>
    restoreSessionWithinAuthTransition(unlockFn),
  );
}

export function tryRestoreSessionAlreadySerialized(
  unlockFn: UnlockFn,
): Promise<boolean> {
  return restoreSessionWithinAuthTransition(unlockFn);
}

export function getPrivateKeyFromCache(
  accountId: string,
): `0x${string}` | null {
  const vault = getCachedVault();
  if (!vault) return null;
  return vault.find((entry) => entry.id === accountId)?.privateKey || null;
}

export function isApiKeyCached(): boolean {
  return getCachedApiKey() !== null;
}

export function isWalletUnlocked(): boolean {
  return getCachedApiKey() !== null || getCachedVault() !== null;
}

export async function clearAllAuthState(): Promise<void> {
  memoryCache.clearInMemoryAuthCache();
  await clearSessionStorage();
}
