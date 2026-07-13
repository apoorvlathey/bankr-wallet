import { newPasswordPolicyError } from "@/constants/securityPolicy";
import { invalidateAuthCeremonies } from "../authTransition";
import {
  type EncryptedData,
  decrypt,
  encrypt,
  encryptVaultKey,
  encryptWithVaultKey,
  hasEncryptedApiKey,
  importVaultKey,
  loadDecryptedApiKey,
  tryDecryptVaultKey,
} from "../crypto";
import { validateGeneralVaultMasterRecovery } from "../vault/generalIntegrity";
import { verifyMasterPassword } from "./masterPasswordVerification";
import { validateV2MnemonicMasterRecovery } from "../mnemonic/integrity";
import {
  computeReEncryptedMnemonicVault,
  loadMnemonicVault,
} from "../mnemonicStorage";
import {
  clearAllAuthState,
  clearInMemoryAuthCache,
  resolvePasswordType,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  computeReEncryptedVault,
  computeVaultKeyMigratedVault,
  hasVaultEntries,
  isVaultKeyEncrypted,
  loadVault,
  VAULT_STORAGE_KEY,
} from "../vaultCrypto";
import {
  checkHasVaultKeySystem,
  handleUnlockWallet,
} from "./walletUnlock";

/** Atomically rotates the explicit master-password recovery factor. */
export async function handleChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const passwordType = await resolvePasswordType(handleUnlockWallet, true);
  if (passwordType === "agent") {
    return { success: false, error: "Password changes require master password" };
  }

  if (!currentPassword) {
    return { success: false, error: "Current master password is required" };
  }
  const newPasswordError = newPasswordPolicyError(
    newPassword,
    "New password",
  );
  if (newPasswordError) {
    return { success: false, error: newPasswordError };
  }
  if (newPassword === currentPassword) {
    return {
      success: false,
      error: "New password must be different from the current password",
    };
  }

  try {
    const rotation = await withStorageLock(
      WALLET_SECRET_OPERATION_LOCK_KEY,
      async (): Promise<{ success: boolean; error?: string }> => {
        const hasVaultKeySystemActive = await checkHasVaultKeySystem();

        // Rotation removes passkey protection, so prove mnemonic master
        // recovery before preparing any replacement storage.
        const mnemonicIntegrity =
          await validateV2MnemonicMasterRecovery(currentPassword);
        if (!mnemonicIntegrity.success) {
          return {
            success: false,
            error: `${mnemonicIntegrity.error}. Password was not changed.`,
          };
        }

        if (hasVaultKeySystemActive) {
          const {
            encryptedVaultKeyMaster,
            encryptedApiKey,
            encryptedApiKeyVault,
          } = await chrome.storage.local.get([
            "encryptedVaultKeyMaster",
            "encryptedApiKey",
            "encryptedApiKeyVault",
          ]);
          if (!encryptedVaultKeyMaster) {
            return { success: false, error: "No vault key found" };
          }

          const vaultKeyBytes = await tryDecryptVaultKey(
            encryptedVaultKeyMaster,
            currentPassword,
          );
          if (!vaultKeyBytes) {
            return { success: false, error: "Invalid master password" };
          }

          const generalIntegrity = await validateGeneralVaultMasterRecovery(
            vaultKeyBytes,
            currentPassword,
          );
          if (!generalIntegrity.success) {
            return {
              success: false,
              error: `${generalIntegrity.error}. Password was not changed.`,
            };
          }

          const newEncryptedVaultKeyMaster = await encryptVaultKey(
            vaultKeyBytes,
            newPassword,
          );
          const preparedVaultKeyBytes = await tryDecryptVaultKey(
            newEncryptedVaultKeyMaster,
            newPassword,
          );
          if (
            !preparedVaultKeyBytes ||
            preparedVaultKeyBytes.length !== vaultKeyBytes.length ||
            !preparedVaultKeyBytes.every(
              (byte, index) => byte === vaultKeyBytes[index],
            )
          ) {
            return {
              success: false,
              error: "Failed to verify the new password wrapper",
            };
          }
          const vaultKey = await importVaultKey(vaultKeyBytes);

          // Finish any partial legacy PK migration before the old password is
          // invalidated. Existing vault-key entries remain byte-for-byte.
          const currentVault = await loadVault();
          let migratedVault = null;
          if (
            currentVault?.entries.some(
              (entry) => !isVaultKeyEncrypted(entry.keystore),
            )
          ) {
            migratedVault = await computeVaultKeyMigratedVault(
              currentPassword,
              vaultKey,
            );
            if (!migratedVault) {
              return {
                success: false,
                error: "Failed to migrate private key vault",
              };
            }
          }

          let migratedApiKeyVault: EncryptedData | null = null;
          if (!encryptedApiKeyVault && encryptedApiKey) {
            const apiKey = await decrypt(encryptedApiKey, currentPassword);
            migratedApiKeyVault = await encryptWithVaultKey(vaultKey, apiKey);
          }

          const mnemonicVault = await loadMnemonicVault();
          let newMnemonicVault = null;
          if (mnemonicVault) {
            newMnemonicVault = await computeReEncryptedMnemonicVault(
              currentPassword,
              newPassword,
            );
            if (!newMnemonicVault) {
              return {
                success: false,
                error: "Failed to re-encrypt mnemonic vault",
              };
            }
          }

          // One atomic write rotates both recovery wrappers, completes any
          // partial migrations, and clears all secondary factors together.
          const storageUpdate: Record<string, unknown> = {
            encryptedVaultKeyMaster: newEncryptedVaultKeyMaster,
            encryptedVaultKeyAgent: null,
            agentPasswordEnabled: false,
            passkeyUnlock: null,
          };
          if (encryptedApiKey) storageUpdate.encryptedApiKey = null;
          if (migratedApiKeyVault) {
            storageUpdate.encryptedApiKeyVault = migratedApiKeyVault;
          }
          if (newMnemonicVault) {
            storageUpdate.mnemonicVault = newMnemonicVault;
          }
          if (migratedVault) {
            storageUpdate[VAULT_STORAGE_KEY] = migratedVault;
          }
          await chrome.storage.local.set(storageUpdate);
        } else {
          // Legacy API, PK, and mnemonic data must all rotate in one write.
          if (!(await verifyMasterPassword(currentPassword))) {
            return { success: false, error: "Invalid master password" };
          }

          const storageUpdate: Record<string, unknown> = {};
          const hasApiKey = await hasEncryptedApiKey();
          if (hasApiKey) {
            const apiKey = await loadDecryptedApiKey(currentPassword);
            if (!apiKey) {
              return {
                success: false,
                error: "Failed to decrypt API key",
              };
            }
            storageUpdate.encryptedApiKey = await encrypt(apiKey, newPassword);
          }

          const hasVault = await hasVaultEntries();
          if (hasVault) {
            const newVault = await computeReEncryptedVault(
              currentPassword,
              newPassword,
            );
            if (!newVault) {
              return {
                success: false,
                error: "Failed to re-encrypt vault",
              };
            }
            storageUpdate[VAULT_STORAGE_KEY] = newVault;
          }

          const mnemonicVault = await loadMnemonicVault();
          if (mnemonicVault) {
            const newMnemonicVault = await computeReEncryptedMnemonicVault(
              currentPassword,
              newPassword,
            );
            if (!newMnemonicVault) {
              return {
                success: false,
                error: "Failed to re-encrypt mnemonic vault",
              };
            }
            storageUpdate.mnemonicVault = newMnemonicVault;
          }

          if (Object.keys(storageUpdate).length > 0) {
            await chrome.storage.local.set(storageUpdate);
          }
        }

        invalidateAuthCeremonies();
        clearInMemoryAuthCache();
        return { success: true };
      },
    );
    if (!rotation.success) return rotation;

    await clearAllAuthState().catch((error) => {
      console.error(
        "[authHandlers] Failed to clear persisted auth state after password rotation:",
        error,
      );
    });
    chrome.runtime
      .sendMessage({ type: "walletLockedExternal" })
      .catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("[authHandlers]", error);
    return { success: false, error: "Failed to change password" };
  }
}
