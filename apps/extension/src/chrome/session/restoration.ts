/** Serialized native Never-session restoration and password-type recovery. */

import {
  invalidateAuthCeremonies,
  runSerializedAuthTransition,
} from "../authTransition";
import type { PasswordType } from "../types";
import {
  getAutoLockTimeout,
  readStoredAutoLockTimeout,
  setCachedAutoLockTimeout,
} from "./autoLockPolicy";
import { getPasswordType } from "./cacheAccess";
import * as memoryCache from "./inMemoryCache";
import {
  getSessionPassword,
  readPersistedSessionRecord,
  storeSessionAtomic,
} from "./persistence";
import { clearAllAuthState, clearSessionStorage } from "./teardown";

export type UnlockFn = (
  password: string,
) => Promise<{ success: boolean; passwordType?: PasswordType }>;

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

async function restoreSessionWithinAuthTransition(
  unlockFn: UnlockFn,
): Promise<boolean> {
  // Re-read authoritative sync storage inside the serialized transition.
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

    // A setting change while unlock was in flight must win over restoration.
    const currentTimeout = await readStoredAutoLockTimeout();
    setCachedAutoLockTimeout(currentTimeout);
    if (currentTimeout !== 0) {
      await clearAllAuthState();
      return false;
    }

    // The wrapper that decrypted is authoritative. Persisted metadata may
    // confirm it but can never upgrade an agent session to master.
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
    await storeSessionAtomic(
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
