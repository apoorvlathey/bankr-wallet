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
  getCurrentSessionFactorBinding,
  readSessionCapability,
  storeSessionCapabilityAtomic,
  updateSessionCapabilityLease,
  type SessionUnlockMethod,
} from "./capabilityPersistence";
import { getActiveWalletUiSurfaceIds } from "./uiSurfaceLease";
import { removeSessionItems } from "./storage";
import {
  getSessionPasskeyCredential,
  storePasskeySessionAtomic,
} from "./passkeyPersistence";
import { clearAllAuthState, clearSessionStorage } from "./teardown";
import { tryDecryptVaultKey } from "../crypto";
import { unlockPrivacyVaultWithPassword } from "../privacy/vault";
import { readPrivacyVault } from "../privacy/repository";

const RESTORED_PASSKEY_SESSION = Symbol("restored-passkey-session");
const RESTORED_SESSION_CAPABILITY = Symbol("restored-session-capability");

export interface RestoredPasskeySessionCredential {
  readonly [RESTORED_PASSKEY_SESSION]: true;
  readonly vaultKeyBytes: Uint8Array;
  readonly passkeyBinding: string;
}

export interface RestoredSessionCapabilityCredential {
  readonly [RESTORED_SESSION_CAPABILITY]: true;
  readonly vaultKeyBytes: Uint8Array;
  readonly privacyKeyBytes: Uint8Array | null;
  readonly privacyKeyId: string | null;
  readonly unlockMethod: SessionUnlockMethod;
  readonly passwordType: PasswordType;
  readonly factorBinding: string;
}

export function isRestoredSessionCapabilityCredential(
  value: unknown,
): value is RestoredSessionCapabilityCredential {
  return typeof value === "object" && value !== null &&
    (value as RestoredSessionCapabilityCredential)[RESTORED_SESSION_CAPABILITY] === true;
}

function createRestoredSessionCapabilityCredential(
  value: Omit<RestoredSessionCapabilityCredential, typeof RESTORED_SESSION_CAPABILITY>,
): RestoredSessionCapabilityCredential {
  const credential = {} as RestoredSessionCapabilityCredential;
  Object.defineProperties(credential, {
    [RESTORED_SESSION_CAPABILITY]: { value: true },
    vaultKeyBytes: { value: value.vaultKeyBytes },
    privacyKeyBytes: { value: value.privacyKeyBytes },
    privacyKeyId: { value: value.privacyKeyId },
    unlockMethod: { value: value.unlockMethod },
    passwordType: { value: value.passwordType },
    factorBinding: { value: value.factorBinding },
  });
  return Object.freeze(credential);
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
  credential: string | RestoredPasskeySessionCredential | RestoredSessionCapabilityCredential,
) => Promise<{ success: boolean; passwordType?: PasswordType }>;

async function restoreUnifiedSession(
  unlockFn: UnlockFn,
  timeout: number,
): Promise<boolean | null> {
  const session = await readPersistedSessionRecord();
  if (session.encryptedSessionCapabilities === undefined) return null;
  const capability = await readSessionCapability();
  if (!capability) {
    await clearSessionStorage();
    return false;
  }
  let credential: RestoredSessionCapabilityCredential | null = null;
  try {
    if (capability.autoLockTimeout !== timeout) {
      await clearSessionStorage();
      return false;
    }
    const currentBinding = await getCurrentSessionFactorBinding(
      capability.unlockMethod,
      capability.passwordType,
    );
    if (!currentBinding || currentBinding !== capability.factorBinding) {
      await clearSessionStorage();
      return false;
    }
    const activeIds = getActiveWalletUiSurfaceIds();
    const continuouslyOpen = capability.leaseState === "active" &&
      activeIds.some((id) => capability.activeSurfaceIds.includes(id));
    const inactiveExpiry = capability.leaseState === "idle"
      ? capability.idleExpiresAt
      : timeout === 0 ? null : capability.lastActiveAt + timeout;
    if (
      timeout !== 0 &&
      !continuouslyOpen &&
      (inactiveExpiry === null || Date.now() >= inactiveExpiry)
    ) {
      await clearSessionStorage();
      return false;
    }

    credential = createRestoredSessionCapabilityCredential({
      vaultKeyBytes: capability.vaultKeyBytes,
      privacyKeyBytes: capability.privacyKeyBytes,
      privacyKeyId: capability.privacyKeyId,
      unlockMethod: capability.unlockMethod,
      passwordType: capability.passwordType,
      factorBinding: capability.factorBinding,
    });
    const result = await unlockFn(credential);
    if (!result.success || result.passwordType !== capability.passwordType) {
      await clearAllAuthState();
      return false;
    }
    const currentTimeout = await readStoredAutoLockTimeout();
    setCachedAutoLockTimeout(currentTimeout);
    if (currentTimeout !== timeout) {
      await clearAllAuthState();
      return false;
    }
    memoryCache.setCurrentSessionId(capability.sessionId);
    memoryCache.setCachedPasswordType(capability.passwordType);
    memoryCache.setAuthSessionHardExpiry(
      activeIds.length > 0 ? null : inactiveExpiry,
    );
    if (activeIds.length > 0) {
      await updateSessionCapabilityLease(activeIds);
    }
    await removeSessionItems([
      "encryptedSessionPassword",
      "encryptedSessionVaultKey",
      "sessionCredentialKind",
    ]);
    invalidateAuthCeremonies();
    console.log("Unified session restored after service worker restart");
    return true;
  } catch (error) {
    console.error("Failed to restore unified session:", error);
    await clearAllAuthState().catch(() => memoryCache.clearInMemoryAuthCache());
    return false;
  } finally {
    // These arrays are shared with the branded credential and are consumed
    // synchronously by unlockFn before it resolves.
    capability.vaultKeyBytes.fill(0);
    capability.privacyKeyBytes?.fill(0);
  }
}

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

  const unifiedResult = await restoreUnifiedSession(unlockFn, timeout);
  if (unifiedResult !== null) return unifiedResult;

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
  let restoredPasskeyTiming: {
    startedAt: number;
    autoLockTimeout: number;
    expiresAt: number | null;
  } | null = null;
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
      const expectedNeverMarker = timeout === 0;
      const hasAuthenticatedTiming = passkeyCredential.startedAt !== null;
      if (
        session.autoLockNever !== expectedNeverMarker ||
        passkeyCredential.autoLockTimeout !== timeout ||
        (!hasAuthenticatedTiming && timeout !== 0) ||
        (hasAuthenticatedTiming &&
          session.sessionStartedAt !== passkeyCredential.startedAt) ||
        (timeout !== 0 &&
          (passkeyCredential.expiresAt === null ||
            Date.now() >= passkeyCredential.expiresAt))
      ) {
        passkeyCredential.vaultKeyBytes.fill(0);
        await clearSessionStorage();
        return false;
      }
      if (hasAuthenticatedTiming) {
        restoredPasskeyTiming = {
          startedAt: passkeyCredential.startedAt!,
          autoLockTimeout: passkeyCredential.autoLockTimeout,
          expiresAt: passkeyCredential.expiresAt,
        };
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
    const activeSurfaceIds = getActiveWalletUiSurfaceIds();
    if (credentialKind === "password") {
      if (!restoredPassword) {
        await clearSessionStorage();
        return false;
      }
      const wrapperName = resolvedPasswordType === "master"
        ? "encryptedVaultKeyMaster"
        : "encryptedVaultKeyAgent";
      const wrapper = (await chrome.storage.local.get(wrapperName))[wrapperName];
      const vaultKeyBytes = await tryDecryptVaultKey(wrapper, restoredPassword);
      if (!vaultKeyBytes) {
        // Compatibility for released legacy/view-only fixtures with no
        // general wrapper. Real modern wallets take the key-capability branch.
        await storeSessionAtomic(
          sessionId,
          true,
          resolvedPasswordType,
          restoredPassword,
        );
      } else {
        const privacy = resolvedPasswordType === "master"
          ? await unlockPrivacyVaultWithPassword(restoredPassword).catch(() => null)
          : null;
        try {
          await storeSessionCapabilityAtomic({
            sessionId,
            unlockMethod: "password",
            passwordType: resolvedPasswordType,
            vaultKeyBytes,
            privacyKey: privacy
              ? { keyBytes: privacy.keyBytes, keyId: privacy.keyId }
              : null,
            autoLockTimeout: timeout,
            activeSurfaceIds,
          });
        } finally {
          vaultKeyBytes.fill(0);
          privacy?.keyBytes.fill(0);
        }
      }
    } else if (restoredPasskeyCredential) {
      // Legacy passkey envelopes never carried the Shield key. If a privacy
      // vault already exists, require one fresh assertion so its capability
      // is included instead of silently restoring a partial master session.
      if ((await readPrivacyVault()).status === "valid") {
        await clearAllAuthState();
        return false;
      }
      const currentBinding = await getCurrentSessionFactorBinding(
        "passkey",
        "master",
      );
      if (currentBinding === restoredPasskeyCredential.passkeyBinding) {
        await storeSessionCapabilityAtomic({
          sessionId,
          unlockMethod: "passkey",
          passwordType: "master",
          vaultKeyBytes: restoredPasskeyCredential.vaultKeyBytes,
          privacyKey: null,
          autoLockTimeout: timeout,
          activeSurfaceIds,
        });
      } else {
        await storePasskeySessionAtomic(
          sessionId,
          restoredPasskeyCredential.vaultKeyBytes,
          restoredPasskeyCredential.passkeyBinding,
          restoredPasskeyTiming ?? { autoLockTimeout: 0 },
        );
      }
    } else {
      await clearSessionStorage();
      return false;
    }

    memoryCache.setAuthSessionHardExpiry(
      activeSurfaceIds.length > 0
        ? null
        : credentialKind === "passkey-vault"
          ? restoredPasskeyTiming?.expiresAt ?? null
          : null,
    );
    memoryCache.setCurrentSessionId(sessionId);
    memoryCache.setCachedPasswordType(resolvedPasswordType);

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
