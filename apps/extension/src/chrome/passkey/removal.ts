import {
  getAuthCeremonyEpoch,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "../authTransition";
import { validateGeneralVaultMasterRecovery } from "../generalVaultIntegrity";
import { validateV2MnemonicMasterRecovery } from "../mnemonic/integrity";
import { withMnemonicVaultLock } from "../mnemonicStorage";
import { PASSKEY_UNLOCK_STORAGE_KEY } from "./repository";
import {
  getMasterVaultKeyBytes,
  stalePasskeyCeremonyResult,
} from "./status";
import { clearAllAuthState } from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

async function validateV2MnemonicProtectionBeforePasskeyRemoval(
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const integrity = await validateV2MnemonicMasterRecovery(masterPassword);
  if (integrity.success) return integrity;
  return {
    success: false,
    error: `${integrity.error}. Biometric unlock was not removed.`,
  };
}

export async function handleRemovePasskeyUnlock(
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const expectedAuthEpoch = getAuthCeremonyEpoch();
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      if (!isCurrentAuthCeremonyEpoch(expectedAuthEpoch)) {
        return stalePasskeyCeremonyResult();
      }
      const vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);
      if (!vaultKeyBytes) {
        return { success: false, error: "Invalid master password" };
      }

      const generalIntegrity = await validateGeneralVaultMasterRecovery(
        vaultKeyBytes,
        masterPassword,
      );
      if (!generalIntegrity.success) {
        return {
          success: false,
          error: `${generalIntegrity.error}. Biometric unlock was not removed.`,
        };
      }
      const mnemonicIntegrity = await withMnemonicVaultLock(() =>
        validateV2MnemonicProtectionBeforePasskeyRemoval(masterPassword),
      );
      if (!mnemonicIntegrity.success) return mnemonicIntegrity;
      if (!isCurrentAuthCeremonyEpoch(expectedAuthEpoch)) {
        return stalePasskeyCeremonyResult();
      }

      await chrome.storage.local.remove(PASSKEY_UNLOCK_STORAGE_KEY);
      invalidateAuthCeremonies();
      await clearAllAuthState();
      chrome.runtime
        .sendMessage({ type: "walletLockedExternal" })
        .catch(() => {});
      return { success: true };
    } catch (error) {
      console.error("[passkeyUnlock] Failed to remove biometric unlock:", error);
      return { success: false, error: "Failed to remove biometric unlock" };
    }
  });
}
