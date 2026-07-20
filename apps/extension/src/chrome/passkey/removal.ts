import {
  getAuthCeremonyEpoch,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "../authTransition";
import { validateGeneralVaultMasterRecovery } from "../vault/generalIntegrity";
import { validateV2MnemonicMasterRecovery } from "../mnemonic/integrity";
import { withMnemonicVaultLock } from "../mnemonicStorage";
import { PASSKEY_UNLOCK_STORAGE_KEY } from "./repository";
import {
  getMasterVaultKeyBytes,
  stalePasskeyCeremonyResult,
} from "./status";
import {
  clearInMemoryAuthCache,
  clearSessionStorage,
  getCachedPrivacyKey,
  revokePersistedSessionRecoveryKey,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { PRIVACY_VAULT_STORAGE_KEY } from "../privacy/record";
import { preparePrivacyVaultForPasskeyRemoval } from "../privacy/vault";

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
      const preparedPrivacy = await preparePrivacyVaultForPasskeyRemoval(
        masterPassword,
        getCachedPrivacyKey(),
      );
      if (preparedPrivacy === false) {
        return {
          success: false,
          error:
            "Shield recovery could not be verified. Biometric unlock was not removed.",
        };
      }
      if (!isCurrentAuthCeremonyEpoch(expectedAuthEpoch)) {
        return stalePasskeyCeremonyResult();
      }

      // Revoke the durable Never-session recovery half before deleting this
      // factor. A failed revocation leaves biometric unlock fully intact.
      await revokePersistedSessionRecoveryKey();
      const storageUpdate: Record<string, unknown> = {
        [PASSKEY_UNLOCK_STORAGE_KEY]: null,
      };
      if (preparedPrivacy) {
        storageUpdate[PRIVACY_VAULT_STORAGE_KEY] = preparedPrivacy;
      }
      await chrome.storage.local.set(storageUpdate);
      await chrome.storage.local
        .remove(PASSKEY_UNLOCK_STORAGE_KEY)
        .catch((error) => {
          // The logical factor is already null. Physical cleanup can retry on
          // a later setup/removal without reviving biometric authority.
          console.warn(
            "[passkeyUnlock] Failed to remove disabled biometric record:",
            error,
          );
        });
      invalidateAuthCeremonies();
      clearInMemoryAuthCache();
      await clearSessionStorage().catch((error) => {
        // The recovery key was already removed before the factor commit, so
        // any remaining native-session ciphertext is non-restorable.
        console.warn(
          "[passkeyUnlock] Failed to clear non-restorable session residue:",
          error,
        );
      });
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
