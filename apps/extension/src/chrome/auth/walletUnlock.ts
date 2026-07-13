import { hydrateAuthSessionFromVaultKeyBytes } from "./sessionHydration";
import {
  hasEncryptedApiKey,
  loadDecryptedApiKey,
  tryDecryptVaultKey,
} from "../crypto";
import { migrateToVaultKeySystem } from "./legacyVaultKeyMigration";
import { unlockMnemonicKeyWithPassword } from "../mnemonicStorage";
import {
  clearAllAuthState,
  getAutoLockTimeout,
  setCachedApiKey,
  setCachedPasswordDirect,
  setCachedPasswordType,
  setCachedVault,
  setCurrentSessionId,
  storeSessionAtomic,
} from "../sessionCache";
import type { PasswordType } from "../types";
import { decryptAllKeys, hasVaultEntries } from "../vaultCrypto";

export interface UnlockWalletResult {
  success: boolean;
  error?: string;
  passwordType?: PasswordType;
}

/** Unlock with either the current vault-key system or the legacy format. */
export async function handleUnlockWallet(
  password: string,
): Promise<UnlockWalletResult> {
  const hasVaultKeySystemActive = await checkHasVaultKeySystem();

  if (hasVaultKeySystemActive) {
    return await unlockWithVaultKeySystem(password);
  }
  return await unlockWithLegacySystem(password);
}

/** Checks if the general vault-key system is in use. */
export async function checkHasVaultKeySystem(): Promise<boolean> {
  const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
    "encryptedVaultKeyMaster",
  );
  return !!encryptedVaultKeyMaster;
}

/** Tries master and agent wrappers before hydrating one complete session. */
async function unlockWithVaultKeySystem(
  password: string,
): Promise<UnlockWalletResult> {
  const {
    encryptedVaultKeyMaster,
    encryptedVaultKeyAgent,
    agentPasswordEnabled,
  } = await chrome.storage.local.get([
    "encryptedVaultKeyMaster",
    "encryptedVaultKeyAgent",
    "agentPasswordEnabled",
  ]);

  if (!encryptedVaultKeyMaster) {
    return { success: false, error: "No encrypted vault key found" };
  }

  // Race both derivations to avoid a password-type timing oracle.
  const tryMaster = tryDecryptVaultKey(encryptedVaultKeyMaster, password);
  const tryAgent =
    agentPasswordEnabled && encryptedVaultKeyAgent
      ? tryDecryptVaultKey(encryptedVaultKeyAgent, password)
      : Promise.resolve(null);
  const [masterResult, agentResult] = await Promise.all([tryMaster, tryAgent]);

  let vaultKeyBytes: Uint8Array | null = null;
  let passwordType: PasswordType = "master";
  if (masterResult) {
    vaultKeyBytes = masterResult;
    passwordType = "master";
  } else if (agentResult) {
    vaultKeyBytes = agentResult;
    passwordType = "agent";
  }

  if (!vaultKeyBytes) {
    return { success: false, error: "Invalid password" };
  }

  let mnemonicKey: { key: CryptoKey; keyId: string } | null = null;
  if (passwordType === "master") {
    try {
      const unlocked = await unlockMnemonicKeyWithPassword(password);
      if (unlocked) {
        mnemonicKey = { key: unlocked.key, keyId: unlocked.keyId };
      }
    } catch (error) {
      // Corrupt mnemonic state must not lock out Bankr or private-key accounts.
      console.error("Failed to unlock mnemonic vault:", error);
    }
  }

  const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
    vaultKeyBytes,
    passwordType,
    {
      password,
      persistPasswordSession: true,
      migrateLegacyPrivateKeys: passwordType === "master",
      mnemonicKey,
    },
  );
  if (!hydrated.success) {
    return hydrated;
  }

  return { success: true, passwordType };
}

/** Unlocks legacy password ciphertext and attempts the one-time migration. */
async function unlockWithLegacySystem(
  password: string,
): Promise<UnlockWalletResult> {
  try {
    const hasApiKey = await hasEncryptedApiKey();
    let apiKey: string | null = null;

    if (hasApiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }

    const hasVault = await hasVaultEntries();
    if (hasVault) {
      const vault = await decryptAllKeys(password);
      if (!vault) {
        if (!hasApiKey) {
          return { success: false, error: "Invalid password" };
        }
      } else {
        setCachedVault(vault);
      }
    }

    if (!hasApiKey && !hasVault) {
      return { success: false, error: "No encrypted data found" };
    }

    await migrateToVaultKeySystem(password, apiKey);

    setCachedPasswordType("master");
    setCachedPasswordDirect(password);

    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      const sessionId = crypto.randomUUID();
      await storeSessionAtomic(sessionId, true, "master", password);
      setCurrentSessionId(sessionId);
    }

    return { success: true, passwordType: "master" };
  } catch (error) {
    // A failed migration/persistence must not leave decrypted credentials live.
    await clearAllAuthState().catch(() => undefined);
    console.error("[authHandlers] Legacy unlock failed:", error);
    return { success: false, error: "Failed to unlock wallet" };
  }
}
