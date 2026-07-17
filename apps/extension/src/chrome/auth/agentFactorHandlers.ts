import { newPasswordPolicyError } from "@/constants/securityPolicy";
import { invalidateAuthCeremonies } from "../authTransition";
import { encryptVaultKey, tryDecryptVaultKey } from "../crypto";
import { validateV2MnemonicMasterRecovery } from "../mnemonic/integrity";
import { validateGeneralVaultMasterRecovery } from "../vault/generalIntegrity";
import {
  clearInMemoryAuthCache,
  clearSessionStorage,
  getCachedVaultKey,
  revokePersistedSessionRecoveryKey,
  resolvePasswordType,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { handleUnlockWallet } from "./walletUnlock";

/** Sets an agent password after proving the current master recovery path. */
export async function handleSetAgentPassword(
  agentPassword: string,
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  if ((await resolvePasswordType(handleUnlockWallet, true)) !== "master") {
    return {
      success: false,
      error: "Must be unlocked with master password to set agent password",
    };
  }

  if (!getCachedVaultKey()) {
    return {
      success: false,
      error: "Vault key not available. Please unlock the wallet first.",
    };
  }

  const agentPasswordError = newPasswordPolicyError(
    agentPassword,
    "Agent password",
  );
  if (agentPasswordError) {
    return { success: false, error: agentPasswordError };
  }
  if (typeof masterPassword !== "string" || !masterPassword) {
    return { success: false, error: "Master password is required" };
  }

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    let vaultKeyBytes: Uint8Array | null = null;
    try {
      const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
        "encryptedVaultKeyMaster",
      );
      if (!encryptedVaultKeyMaster) {
        return { success: false, error: "No vault key found" };
      }

      vaultKeyBytes = await tryDecryptVaultKey(
        encryptedVaultKeyMaster,
        masterPassword,
      );
      if (!vaultKeyBytes) {
        return { success: false, error: "Invalid master password" };
      }

      // Check equality only after authenticating the supplied master proof, so
      // two identical but incorrect inputs still report an invalid master.
      if (agentPassword === masterPassword) {
        return {
          success: false,
          error: "Agent password must differ from master password",
        };
      }

      const [generalIntegrity, mnemonicIntegrity] = await Promise.all([
        validateGeneralVaultMasterRecovery(vaultKeyBytes, masterPassword),
        validateV2MnemonicMasterRecovery(masterPassword),
      ]);
      const recoveryError = !generalIntegrity.success
        ? generalIntegrity.error
        : !mnemonicIntegrity.success
          ? mnemonicIntegrity.error
          : null;
      if (recoveryError) {
        return {
          success: false,
          error: `${recoveryError}. Agent password was not changed.`,
        };
      }

      const encryptedVaultKeyAgent = await encryptVaultKey(
        vaultKeyBytes,
        agentPassword,
      );
      await chrome.storage.local.set({
        encryptedVaultKeyAgent,
        agentPasswordEnabled: true,
      });

      // The current master-keyed session remains valid; do not clear it.
      return { success: true };
    } catch (error) {
      console.error("[authHandlers]", error);
      return { success: false, error: "Failed to set agent password" };
    } finally {
      vaultKeyBytes?.fill(0);
    }
  });
}

/** Removes the agent factor only after explicit full master recovery proof. */
export async function handleRemoveAgentPassword(
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
        "encryptedVaultKeyMaster",
      );
      if (!encryptedVaultKeyMaster) {
        return { success: false, error: "No vault key found" };
      }

      const vaultKeyBytes = await tryDecryptVaultKey(
        encryptedVaultKeyMaster,
        masterPassword,
      );
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
          error: `${generalIntegrity.error}. Agent password was not removed.`,
        };
      }

      // Revoke the durable Never-session recovery half before deleting this
      // factor. A failed revocation leaves the agent wrapper fully intact.
      await revokePersistedSessionRecoveryKey();
      await chrome.storage.local.set({
        encryptedVaultKeyAgent: null,
        agentPasswordEnabled: false,
      });

      invalidateAuthCeremonies();
      clearInMemoryAuthCache();
      await clearSessionStorage().catch((error) => {
        // The recovery key was already removed before the factor commit, so
        // any remaining native-session ciphertext is non-restorable.
        console.warn(
          "[authHandlers] Failed to clear non-restorable session residue:",
          error,
        );
      });
      chrome.runtime
        .sendMessage({ type: "walletLockedExternal" })
        .catch(() => {});

      return { success: true };
    } catch (error) {
      console.error("[authHandlers]", error);
      return { success: false, error: "Failed to remove agent password" };
    }
  });
}
