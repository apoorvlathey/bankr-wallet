/** Serialized native Never-session restoration and password-type recovery. */

import {
  invalidateAuthCeremonies,
  isSessionRestorationBlockedByManualLock,
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
import {
  getSessionPasskeyCredential,
  storePasskeySessionAtomic,
} from "./passkeyPersistence";
import { clearAllAuthState, clearSessionStorage } from "./teardown";

const RESTORED_PASSKEY_SESSION = Symbol("restored-passkey-session");

export interface RestoredPasskeySessionCredential {
  readonly [RESTORED_PASSKEY_SESSION]: true;
  readonly vaultKeyBytes: Uint8Array;
  readonly passkeyBinding: string;
}

export function isRestoredPasskeySessionCredential(
  value: unknown,
): value is RestoredPasskeySessionCredential {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RestoredPasskeySessionCredential)[RESTORED_PASSKEY_SESSION] ===
      true
  );
}

function createRestoredPasskeySessionCredential(
  vaultKeyBytes: Uint8Array,
  passkeyBinding: string,
): RestoredPasskeySessionCredential {
  const credential = {} as RestoredPasskeySessionCredential;
  Object.defineProperties(credential, {
    [RESTORED_PASSKEY_SESSION]: { value: true },
    vaultKeyBytes: { value: vaultKeyBytes },
    passkeyBinding: { value: passkeyBinding },
  });
  return Object.freeze(credential);
}

export type UnlockFn = (
  credential: string | RestoredPasskeySessionCredential,
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
  if (isSessionRestorationBlockedByManualLock()) return false;

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
  const credentialKind =
    session.sessionCredentialKind === "password" ||
    session.sessionCredentialKind === "passkey-vault"
      ? session.sessionCredentialKind
      : undefined;

  if (
    !sessionId ||
    session.autoLockNever !== true ||
    !credentialKind
  ) {
    if (
      session.autoLockNever !== undefined ||
      session.encryptedSessionPassword !== undefined ||
      session.encryptedSessionVaultKey !== undefined ||
      session.sessionCredentialKind !== undefined
    ) {
      await clearSessionStorage();
    }
    return false;
  }

  let restoredPassword: string | null = null;
  let restoredPasskeyCredential: RestoredPasskeySessionCredential | null = null;
  try {
    let unlockCredential: string | RestoredPasskeySessionCredential;
    if (credentialKind === "password") {
      if (
        !session.encryptedSessionPassword ||
        session.encryptedSessionVaultKey
      ) {
        await clearSessionStorage();
        return false;
      }
      const password = await getSessionPassword();
      if (!password) {
        await clearSessionStorage();
        return false;
      }
      restoredPassword = password;
      unlockCredential = password;
    } else {
      if (
        persistedPasswordType !== "master" ||
        !session.encryptedSessionVaultKey ||
        session.encryptedSessionPassword
      ) {
        await clearSessionStorage();
        return false;
      }
      const passkeyCredential = await getSessionPasskeyCredential(sessionId);
      if (!passkeyCredential) {
        await clearSessionStorage();
        return false;
      }
      restoredPasskeyCredential = createRestoredPasskeySessionCredential(
        passkeyCredential.vaultKeyBytes,
        passkeyCredential.passkeyBinding,
      );
      unlockCredential = restoredPasskeyCredential;
    }

    const result = await unlockFn(unlockCredential);
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

    // The wrapper/capability that decrypted is authoritative. Persisted
    // metadata may confirm it but can never upgrade an agent session.
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
    if (credentialKind === "password") {
      if (!restoredPassword) {
        await clearSessionStorage();
        return false;
      }
      await storeSessionAtomic(
        sessionId,
        true,
        resolvedPasswordType,
        restoredPassword,
      );
    } else if (restoredPasskeyCredential) {
      await storePasskeySessionAtomic(
        sessionId,
        restoredPasskeyCredential.vaultKeyBytes,
        restoredPasskeyCredential.passkeyBinding,
      );
    } else {
      await clearSessionStorage();
      return false;
    }

    invalidateAuthCeremonies();
    console.log("Session restored successfully after service worker restart");
    return true;
  } catch (error) {
    console.error("Failed to restore session:", error);
    await clearAllAuthState().catch(() => {
      memoryCache.clearInMemoryAuthCache();
    });
    return false;
  } finally {
    restoredPasskeyCredential?.vaultKeyBytes.fill(0);
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
