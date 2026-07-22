import { invalidateAuthCeremonies } from "../authTransition";
import { tryDecryptVaultKey } from "../crypto";
import { readPrivacyVault } from "../privacy/repository";
import { unlockPrivacyVaultWithPassword } from "../privacy/vault";
import { readStoredAutoLockTimeout, setCachedAutoLockTimeout } from "./autoLockPolicy";
import { getCurrentSessionFactorBinding, storeSessionCapabilityAtomic } from "./capabilityPersistence";
import * as memoryCache from "./inMemoryCache";
import { getSessionPasskeyCredential, storePasskeySessionAtomic } from "./passkeyPersistence";
import { validateRestoredPasskeyTiming, type RestoredPasskeyTiming } from "./passkeyRestorationPolicy";
import { getSessionPassword, readPersistedSessionRecord, storeSessionAtomic } from "./persistence";
import {
  createRestoredPasskeySessionCredential,
  type RestoredPasskeySessionCredential,
  type UnlockFn,
} from "./restoredCredential";
import { clearAllAuthState, clearSessionStorage } from "./teardown";
import { getActiveWalletUiSurfaceIds } from "./uiSurfaceLease";

export async function restoreLegacySession(
  unlockFn: UnlockFn,
  timeout: number,
): Promise<boolean> {
  const session = await readPersistedSessionRecord();
  const sessionId = typeof session.sessionId === "string" ? session.sessionId : null;
  const persistedPasswordType =
    session.passwordType === "master" || session.passwordType === "agent"
      ? session.passwordType
      : undefined;
  const credentialKind =
    session.sessionCredentialKind === "password" ||
    session.sessionCredentialKind === "passkey-vault"
      ? session.sessionCredentialKind
      : undefined;
  if (!sessionId || !credentialKind) {
    if (
      session.autoLockNever !== undefined ||
      session.encryptedSessionPassword !== undefined ||
      session.encryptedSessionVaultKey !== undefined ||
      session.sessionCredentialKind !== undefined
    ) await clearSessionStorage();
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
      const timing = validateRestoredPasskeyTiming(session, passkeyCredential, timeout);
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
    if (persistedPasswordType && persistedPasswordType !== result.passwordType) {
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
        await storeSessionAtomic(sessionId, true, resolvedPasswordType, restoredPassword);
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
      if ((await readPrivacyVault()).status === "valid") {
        await clearAllAuthState();
        return false;
      }
      const currentBinding = await getCurrentSessionFactorBinding("passkey", "master");
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
    await clearAllAuthState().catch(() => memoryCache.clearInMemoryAuthCache());
    return false;
  } finally {
    restoredPasskeyCredential?.vaultKeyBytes.fill(0);
  }
}
