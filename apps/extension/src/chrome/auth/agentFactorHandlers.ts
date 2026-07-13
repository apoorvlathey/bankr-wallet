import { newPasswordPolicyError } from "@/constants/securityPolicy";
import { invalidateAuthCeremonies } from "../authTransition";
import { encryptVaultKey, tryDecryptVaultKey } from "../crypto";
import { validateGeneralVaultMasterRecovery } from "../generalVaultIntegrity";
import {
  clearAllAuthState,
  getAutoLockTimeout,
  getCachedPassword,
  getCachedVaultKey,
  resolvePasswordType,
  tryRestoreSessionAlreadySerialized,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { handleUnlockWallet } from "./walletUnlock";

/** Sets an agent password after proving the current master recovery path. */
export async function handleSetAgentPassword(
  agentPassword: string,
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

  try {
    const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
      "encryptedVaultKeyMaster",
    );
    if (!encryptedVaultKeyMaster) {
      return { success: false, error: "No vault key found" };
    }

    let password = getCachedPassword();
    if (!password) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSessionAlreadySerialized(
          handleUnlockWallet,
        );
        if (restored) {
          password = getCachedPassword();
        }
      }
    }

    if (!password) {
      return {
        success: false,
        error: "Session expired. Please unlock the wallet again.",
      };
    }

    // Equal master/agent passwords would resolve every unlock as master.
    if (agentPassword === password) {
      return {
        success: false,
        error: "Agent password must differ from master password",
      };
    }
    const matchesMaster = await tryDecryptVaultKey(
      encryptedVaultKeyMaster,
      agentPassword,
    );
    if (matchesMaster) {
      return {
        success: false,
        error: "Agent password must differ from master password",
      };
    }

    const vaultKeyBytes = await tryDecryptVaultKey(
      encryptedVaultKeyMaster,
      password,
    );
    if (!vaultKeyBytes) {
      return { success: false, error: "Failed to decrypt vault key" };
    }

    const generalIntegrity = await validateGeneralVaultMasterRecovery(
      vaultKeyBytes,
      password,
    );
    if (!generalIntegrity.success) {
      return {
        success: false,
        error: `${generalIntegrity.error}. Agent password was not changed.`,
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
  }
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

      invalidateAuthCeremonies();
      await chrome.storage.local.set({
        encryptedVaultKeyAgent: null,
        agentPasswordEnabled: false,
      });

      await clearAllAuthState();
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
