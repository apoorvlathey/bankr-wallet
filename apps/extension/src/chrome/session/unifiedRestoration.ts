import { invalidateAuthCeremonies } from "../authTransition";
import { readStoredAutoLockTimeout, setCachedAutoLockTimeout } from "./autoLockPolicy";
import * as memoryCache from "./inMemoryCache";
import { readPersistedSessionRecord } from "./persistence";
import {
  getCurrentSessionFactorBinding,
  readSessionCapability,
  updateSessionCapabilityLease,
} from "./capabilityPersistence";
import { getActiveWalletUiSurfaceIds } from "./uiSurfaceLease";
import { removeSessionItems } from "./storage";
import { clearAllAuthState, clearSessionStorage } from "./teardown";
import {
  createRestoredSessionCapabilityCredential,
  type RestoredSessionCapabilityCredential,
  type UnlockFn,
} from "./restoredCredential";

export async function restoreUnifiedSession(
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
    memoryCache.setAuthSessionHardExpiry(activeIds.length > 0 ? null : inactiveExpiry);
    if (activeIds.length > 0) await updateSessionCapabilityLease(activeIds);
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
    capability.vaultKeyBytes.fill(0);
    capability.privacyKeyBytes?.fill(0);
  }
}
