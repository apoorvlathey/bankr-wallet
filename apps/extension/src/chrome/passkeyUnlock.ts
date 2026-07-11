import {
  tryDecryptVaultKey,
} from "./crypto";
import {
  handleUnlockWallet,
  hydrateAuthSessionFromVaultKeyBytes,
  verifyMasterPassword,
} from "./authHandlers";
import {
  clearAllAuthState,
  getCachedPassword,
  resolvePasswordType,
} from "./sessionCache";
import {
  getAuthCeremonyEpoch,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "./authTransition";
import { isVaultKeyEncrypted, loadVault } from "./vaultCrypto";
import {
  buildPasskeyRecord,
  isValidPasskeyCredentialPayload,
  loadPasskeyUnlockRecord,
  PASSKEY_RP_ID,
  PASSKEY_UNLOCK_STORAGE_KEY,
  savePasskeyRecord,
  unwrapVaultKey,
  type PasskeyCredentialPayload,
  type PasskeyUnlockRecord,
} from "./passkeyUnlockCrypto";

export {
  isValidPasskeyCredentialPayload,
  isValidPasskeyUnlockRecord,
  PASSKEY_RP_ID,
  PASSKEY_UNLOCK_STORAGE_KEY,
} from "./passkeyUnlockCrypto";

export interface PasskeyUnlockStatus {
  configured: boolean;
  rpId: string;
  authCeremonyEpoch: string;
  credentialId?: string;
  prfSalt?: string;
}

async function getMasterVaultKeyBytes(password: string): Promise<Uint8Array | null> {
  if (!password) return null;

  const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
    "encryptedVaultKeyMaster",
  );
  if (!encryptedVaultKeyMaster) {
    return null;
  }

  return tryDecryptVaultKey(encryptedVaultKeyMaster, password);
}

export async function handleGetPasskeyUnlockStatus(): Promise<PasskeyUnlockStatus> {
  const record = await loadPasskeyUnlockRecord();
  if (!record) {
    return {
      configured: false,
      rpId: PASSKEY_RP_ID,
      authCeremonyEpoch: getAuthCeremonyEpoch(),
    };
  }

  return {
    configured: true,
    rpId: PASSKEY_RP_ID,
    authCeremonyEpoch: getAuthCeremonyEpoch(),
    credentialId: record.credentialId,
    prfSalt: record.prfSalt,
  };
}

async function hasLegacyPrivateKeyEntries(): Promise<boolean> {
  const vault = await loadVault();
  return vault?.entries.some((entry) => !isVaultKeyEncrypted(entry.keystore)) === true;
}

export async function handleVerifyPasskeySetupPassword(
  masterPassword: string,
): Promise<{
  success: boolean;
  error?: string;
  authCeremonyEpoch?: string;
}> {
  if (!(await verifyMasterPassword(masterPassword))) {
    return { success: false, error: "Invalid master password" };
  }

  return { success: true, authCeremonyEpoch: getAuthCeremonyEpoch() };
}

async function getCurrentMasterSessionPassword(
  authTransitionAlreadySerialized = false,
): Promise<{
  success: boolean;
  password?: string;
  error?: string;
}> {
  const passwordType = await resolvePasswordType(
    handleUnlockWallet,
    authTransitionAlreadySerialized,
  );
  if (passwordType !== "master") {
    return {
      success: false,
      error: "Biometric unlock setup requires master password",
    };
  }

  const password = getCachedPassword();
  if (!password) {
    return {
      success: false,
      error: "Master password required to set up biometric unlock",
    };
  }

  return { success: true, password };
}

export async function handleCanSetupPasskeyUnlock(): Promise<{
  success: boolean;
  error?: string;
  authCeremonyEpoch?: string;
}> {
  const session = await getCurrentMasterSessionPassword();
  if (!session.success || !session.password) {
    return { success: false, error: session.error };
  }

  const vaultKeyBytes = await getMasterVaultKeyBytes(session.password);
  if (!vaultKeyBytes) {
    return { success: false, error: "Failed to verify master password" };
  }

  return { success: true, authCeremonyEpoch: getAuthCeremonyEpoch() };
}

function staleCeremonyResult(): { success: false; error: string } {
  return {
    success: false,
    error: "Authentication state changed. Please try biometric verification again.",
  };
}

export async function handleSetupPasskeyUnlock(
  payload: Partial<PasskeyCredentialPayload>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return staleCeremonyResult();
  }

  try {
    const session = await getCurrentMasterSessionPassword(true);
    if (!session.success || !session.password) return session;

    const vaultKeyBytes = await getMasterVaultKeyBytes(session.password);
    if (!vaultKeyBytes) {
      return { success: false, error: "Failed to verify master password" };
    }

    const built = await buildPasskeyRecord(payload, vaultKeyBytes);
    if (!built.success || !built.record) return built;

    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      {
        password: session.password,
        persistPasswordSession: true,
        migrateLegacyPrivateKeys: true,
      },
    );
    if (!hydrated.success) return hydrated;
    if (await hasLegacyPrivateKeyEntries()) {
      return {
        success: false,
        error: "Failed to migrate private keys for biometric unlock",
      };
    }
    if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
      return staleCeremonyResult();
    }

    await savePasskeyRecord(built.record);
    invalidateAuthCeremonies();
    return { success: true };
  } catch (error) {
    console.error("[passkeyUnlock] Failed to set up biometric unlock:", error);
    return { success: false, error: "Failed to set up biometric unlock" };
  }
}

export async function handleSetupPasskeyUnlockWithPassword(
  payload: Partial<PasskeyCredentialPayload>,
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return staleCeremonyResult();
  }

  let sessionHydrated = false;
  try {
    let vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);

    if (!vaultKeyBytes) {
      const hasVaultKeySystem = !!(await chrome.storage.local.get(
        "encryptedVaultKeyMaster",
      )).encryptedVaultKeyMaster;
      if (!hasVaultKeySystem) {
        const unlockResult = await handleUnlockWallet(masterPassword);
        if (!unlockResult.success || unlockResult.passwordType !== "master") {
          return { success: false, error: "Invalid master password" };
        }
        sessionHydrated = true;
        vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);
      }
    }

    if (!vaultKeyBytes) {
      if (sessionHydrated) await clearAllAuthState();
      return { success: false, error: "Invalid master password" };
    }

    const built = await buildPasskeyRecord(payload, vaultKeyBytes);
    if (!built.success || !built.record) {
      if (sessionHydrated) await clearAllAuthState();
      return built;
    }

    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      {
        password: masterPassword,
        persistPasswordSession: true,
        migrateLegacyPrivateKeys: true,
      },
    );
    sessionHydrated = hydrated.success;
    if (!hydrated.success) {
      await clearAllAuthState();
      return hydrated;
    }
    if (await hasLegacyPrivateKeyEntries()) {
      await clearAllAuthState();
      return {
        success: false,
        error: "Failed to migrate private keys for biometric unlock",
      };
    }
    if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
      await clearAllAuthState();
      return staleCeremonyResult();
    }

    await savePasskeyRecord(built.record);
    invalidateAuthCeremonies();
    return { success: true };
  } catch (error) {
    if (sessionHydrated) {
      await clearAllAuthState().catch(() => undefined);
    }
    console.error("[passkeyUnlock] Failed to set up biometric unlock:", error);
    return { success: false, error: "Failed to set up biometric unlock" };
  }
}

export async function handleUnlockWithPasskey(
  payload: Partial<PasskeyCredentialPayload>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey unlock payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return staleCeremonyResult();
  }

  try {
    const record = await loadPasskeyUnlockRecord();
    if (!record) {
      return { success: false, error: "Biometric unlock is not set up" };
    }
    if (
      payload.credentialId !== record.credentialId ||
      payload.prfSalt !== record.prfSalt
    ) {
      return { success: false, error: "Passkey does not match this wallet" };
    }

    const vaultKeyBytes = await unwrapVaultKey(
      record.wrappedVaultKey,
      payload.prfKeyMaterial,
    );
    if (!vaultKeyBytes) {
      return { success: false, error: "Biometric unlock failed" };
    }

    await clearAllAuthState();
    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    if (!hydrated.success) {
      await clearAllAuthState();
      return hydrated;
    }

    invalidateAuthCeremonies();

    // Usage metadata is non-essential. A quota/transient storage failure must
    // never turn a successful cache hydration into a half-reported unlock.
    await chrome.storage.local
      .set({
        [PASSKEY_UNLOCK_STORAGE_KEY]: {
          ...record,
          lastUsedAt: Date.now(),
        } satisfies PasskeyUnlockRecord,
      })
      .catch((error) => {
        console.warn("[passkeyUnlock] Failed to update last-used time:", error);
      });

    return { success: true };
  } catch (error) {
    await clearAllAuthState().catch(() => undefined);
    console.error("[passkeyUnlock] Failed to unlock with biometrics:", error);
    return { success: false, error: "Biometric unlock failed" };
  }
}

export async function handleRemovePasskeyUnlock(
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);
    if (!vaultKeyBytes) {
      return { success: false, error: "Invalid master password" };
    }

    await chrome.storage.local.remove(PASSKEY_UNLOCK_STORAGE_KEY);
    invalidateAuthCeremonies();
    return { success: true };
  } catch (error) {
    console.error("[passkeyUnlock] Failed to remove biometric unlock:", error);
    return { success: false, error: "Failed to remove biometric unlock" };
  }
}
