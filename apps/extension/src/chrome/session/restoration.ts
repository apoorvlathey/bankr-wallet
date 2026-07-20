/** Serialized native session restoration and password-type recovery. */
import {
  invalidateAuthCeremonies,
  isSessionRestorationBlockedByManualLock,
  runSerializedAuthTransition,
} from "../authTransition";
import type { PasswordType } from "../types";
import {
  readStoredAutoLockTimeout,
  setCachedAutoLockTimeout,
} from "./autoLockPolicy";
import { getPasswordType, isWalletUnlocked } from "./cacheAccess";
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
import {
  validateRestoredPasskeyTiming,
  type RestoredPasskeyTiming,
} from "./passkeyRestorationPolicy";
import { clearAllAuthState, clearSessionStorage } from "./teardown";
import {
  createRestoredPasskeySessionCredential,
  type RestoredPasskeySessionCredential,
  type UnlockFn,
} from "./restoredCredential";
export {
  isRestoredPasskeySessionCredential,
  type RestoredPasskeySessionCredential,
  type UnlockFn,
} from "./restoredCredential";
export async function resolvePasswordType(
  unlockFn: UnlockFn,
  authTransitionAlreadySerialized = false,
): Promise<PasswordType | null> {
  const cached = getPasswordType();
  if (cached !== null) return cached;
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

  // A passkey master session intentionally has no cached plaintext password.
  // Treating that absence as a lost session would cold-restore the persisted
  // general capability, rotate the auth epoch, and discard the live-only V2
  // mnemonic key. Restoration is therefore idempotent for one coherent,
  // expiry-checked live authorization generation.
  if (getPasswordType() !== null && isWalletUnlocked()) {
    return true;
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
  let restoredPasskeyTiming: RestoredPasskeyTiming | null = null;
  try {
    let unlockCredential: string | RestoredPasskeySessionCredential;
    if (credentialKind === "password") {
      if (
        timeout !== 0 ||
        session.autoLockNever !== true ||
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
      const timing = validateRestoredPasskeyTiming(
        session,
        passkeyCredential,
        timeout,
      );
      if (!timing.valid) {
        passkeyCredential.vaultKeyBytes.fill(0);
        await clearSessionStorage();
        return false;
      }
      restoredPasskeyTiming = timing.timing;
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
    if (
      currentTimeout !== timeout ||
      (restoredPasskeyTiming?.expiresAt !== null &&
        restoredPasskeyTiming?.expiresAt !== undefined &&
        Date.now() >= restoredPasskeyTiming.expiresAt)
    ) {
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
    memoryCache.setAuthSessionHardExpiry(
      credentialKind === "passkey-vault"
        ? restoredPasskeyTiming?.expiresAt ?? null
        : null,
    );
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
        restoredPasskeyTiming ?? { autoLockTimeout: 0 },
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
