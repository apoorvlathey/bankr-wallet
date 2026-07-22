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
  setCachedApiKey,
  setCachedVault,
} from "../sessionCache";
import type { PasswordType } from "../types";
import { decryptAllKeys, hasVaultEntries } from "../vaultCrypto";
import {
  isRestoredPasskeySessionCredential,
  isRestoredSessionCapabilityCredential,
  type RestoredPasskeySessionCredential,
  type RestoredSessionCapabilityCredential,
} from "../session/restoration";
import { clearManualLockRestorationBlock } from "../authTransition";
import { unlockPrivacyVaultWithPassword } from "../privacy/vault";
import {
  unlockWithRestoredPasskeySession,
  unlockWithRestoredSessionCapability,
} from "./restoredSessionUnlock";
export interface UnlockWalletResult {
  success: boolean;
  error?: string;
  passwordType?: PasswordType;
}
/** Unlock with either the current vault-key system or the legacy format. */
export async function handleUnlockWallet(
  credential: string | RestoredPasskeySessionCredential | RestoredSessionCapabilityCredential,
): Promise<UnlockWalletResult> {
  if (isRestoredSessionCapabilityCredential(credential)) {
    return unlockWithRestoredSessionCapability(credential);
  }
  if (isRestoredPasskeySessionCredential(credential)) {
    return unlockWithRestoredPasskeySession(credential);
  }
  if (typeof credential !== "string") {
    return { success: false, error: "Invalid password" };
  }
  const hasVaultKeySystemActive = await checkHasVaultKeySystem();
  const result = hasVaultKeySystemActive
    ? await unlockWithVaultKeySystem(credential)
    : await unlockWithLegacySystem(credential);
  if (result.success) clearManualLockRestorationBlock();
  return result;
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
      console.error("Failed to unlock mnemonic vault:", error);
    }
  }
  const unlockedPrivacy =
    passwordType === "master"
      ? await unlockPrivacyVaultWithPassword(password).catch(() => null)
      : null;
  let hydrated: UnlockWalletResult;
  try {
    hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      passwordType,
      {
        password,
        persistPasswordSession: true,
        migrateLegacyPrivateKeys: passwordType === "master",
        mnemonicKey,
        privacyKey: unlockedPrivacy
          ? {
              key: unlockedPrivacy.key,
              keyBytes: unlockedPrivacy.keyBytes,
              keyId: unlockedPrivacy.keyId,
            }
          : null,
      },
    );
  } finally {
    unlockedPrivacy?.keyBytes.fill(0);
  }
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
    // Re-enter the modern path so the migrated wallet receives the same
    // key-only unified session capability as every existing vault-key wallet.
    return await unlockWithVaultKeySystem(password);
  } catch (error) {
    // A failed migration/persistence must not leave decrypted credentials live.
    await clearAllAuthState().catch(() => undefined);
    console.error("[authHandlers] Legacy unlock failed:", error);
    return { success: false, error: "Failed to unlock wallet" };
  }
}
