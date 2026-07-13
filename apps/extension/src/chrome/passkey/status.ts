import { tryDecryptVaultKey } from "../crypto";
import { handleUnlockWallet, verifyMasterPassword } from "../authHandlers";
import { getAuthCeremonyEpoch, isCurrentAuthCeremonyEpoch } from "../authTransition";
import { loadMnemonicVault } from "../mnemonicStorage";
import { PASSKEY_RP_ID } from "./record";
import { loadPasskeyUnlockRecord } from "./repository";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import {
  getCachedPassword,
  resolvePasswordType,
} from "../sessionCache";
import { isVaultKeyEncrypted, loadVault } from "../vaultCrypto";

export interface PasskeyUnlockStatus {
  configured: boolean;
  rpId: string;
  authCeremonyEpoch: string;
  credentialId?: string;
  prfSalt?: string;
  mnemonicCapable?: boolean;
}

export function stalePasskeyCeremonyResult(): {
  success: false;
  error: string;
} {
  return {
    success: false,
    error:
      "Authentication state changed. Please try biometric verification again.",
  };
}

export async function getMasterVaultKeyBytes(
  password: string,
): Promise<Uint8Array | null> {
  if (!password) return null;
  const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
    "encryptedVaultKeyMaster",
  );
  if (!encryptedVaultKeyMaster) return null;
  return tryDecryptVaultKey(encryptedVaultKeyMaster, password);
}

export async function hasLegacyPrivateKeyEntries(): Promise<boolean> {
  const vault = await loadVault();
  return (
    vault?.entries.some((entry) => !isVaultKeyEncrypted(entry.keystore)) ===
    true
  );
}

export async function getCurrentMasterSessionPassword(
  authTransitionAlreadySerialized = false,
): Promise<{ success: boolean; password?: string; error?: string }> {
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

export async function handleGetPasskeyUnlockStatus(): Promise<PasskeyUnlockStatus> {
  const record = await loadPasskeyUnlockRecord();
  if (!record) {
    return {
      configured: false,
      rpId: PASSKEY_RP_ID,
      authCeremonyEpoch: getAuthCeremonyEpoch(),
    };
  }

  let mnemonicCapable = false;
  if (record.version === 2) {
    try {
      const mnemonicVault = await loadMnemonicVault();
      mnemonicCapable =
        mnemonicVault?.version === 2 &&
        mnemonicVault.keyId === record.mnemonicKeyId &&
        (!!mnemonicVault.keyCheck || mnemonicVault.entries.length > 0);
    } catch {
      // Corrupt/missing mnemonic state never advertises full master access.
    }
  }
  return {
    configured: true,
    rpId: PASSKEY_RP_ID,
    authCeremonyEpoch: getAuthCeremonyEpoch(),
    credentialId: record.credentialId,
    prfSalt: record.prfSalt,
    mnemonicCapable,
  };
}

export async function handleVerifyPasskeySetupPassword(
  masterPassword: string,
): Promise<{
  success: boolean;
  error?: string;
  authCeremonyEpoch?: string;
}> {
  const expectedAuthEpoch = getAuthCeremonyEpoch();
  if (!(await verifyMasterPassword(masterPassword))) {
    return { success: false, error: "Invalid master password" };
  }
  if (!isCurrentAuthCeremonyEpoch(expectedAuthEpoch)) {
    return stalePasskeyCeremonyResult();
  }
  return { success: true, authCeremonyEpoch: expectedAuthEpoch };
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
  const expectedAuthEpoch = getAuthCeremonyEpoch();
  const vaultKeyBytes = await getMasterVaultKeyBytes(session.password);
  if (!vaultKeyBytes) {
    return { success: false, error: "Failed to verify master password" };
  }
  try {
    assertCurrentMasterAuthorization(expectedAuthEpoch);
  } catch {
    return stalePasskeyCeremonyResult();
  }
  return { success: true, authCeremonyEpoch: expectedAuthEpoch };
}
