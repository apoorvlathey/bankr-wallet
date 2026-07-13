import {
  type EncryptedData,
  encryptVaultKey,
  encryptWithVaultKey,
  generateVaultKey,
  importVaultKey,
} from "../crypto";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { setCachedVaultKey } from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  computeVaultKeyMigratedVault,
  VAULT_STORAGE_KEY,
} from "../vaultCrypto";

/**
 * Migrates private keys to vault-key encryption when a general vault key
 * already exists but legacy password-encrypted entries remain.
 */
export async function migratePrivateKeysToVaultKey(
  password: string,
  vaultKey: CryptoKey,
  secretOperationAlreadySerialized = false,
  expectedMasterAuthEpoch?: string,
): Promise<void> {
  try {
    const migrate = async () => {
      const { loadVault, saveVault } = await import("../vaultCrypto");
      const vault = await loadVault();
      if (!vault || vault.entries.length === 0) {
        return;
      }

      const migratedVault = await computeVaultKeyMigratedVault(
        password,
        vaultKey,
      );
      if (!migratedVault) {
        throw new Error("Failed to prepare private key migration");
      }
      if (expectedMasterAuthEpoch) {
        assertCurrentMasterAuthorization(expectedMasterAuthEpoch);
      }
      await saveVault(migratedVault);
    };
    if (secretOperationAlreadySerialized) {
      await migrate();
    } else {
      await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, migrate);
    }

    console.log("Private key migration to vault key completed");
  } catch (error) {
    console.error("Failed to migrate private keys to vault key:", error);
    // Continue without migration - will try again next unlock
  }
}

/**
 * Migrates from legacy direct-password encryption to the general vault-key
 * system, including the API credential and every private key.
 */
export async function migrateToVaultKeySystem(
  password: string,
  apiKey: string | null,
): Promise<void> {
  try {
    await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      // Generate a new vault key
      const vaultKeyBytes = generateVaultKey();
      const vaultKey = await importVaultKey(vaultKeyBytes);

      // Encrypt vault key with master password
      const encryptedVaultKeyMaster = await encryptVaultKey(
        vaultKeyBytes,
        password,
      );

      // Re-encrypt API key with vault key (if exists)
      let encryptedApiKeyVault: EncryptedData | null = null;
      if (apiKey) {
        encryptedApiKeyVault = await encryptWithVaultKey(vaultKey, apiKey);
      }

      // Re-encrypt all private keys with vault key (if vault exists)
      const { loadVault } = await import("../vaultCrypto");
      const vault = await loadVault();
      let updatedVault = vault;
      if (vault && vault.entries.length > 0) {
        updatedVault = await computeVaultKeyMigratedVault(password, vaultKey);
        if (!updatedVault) {
          throw new Error("Failed to prepare private key migration");
        }
      }

      // SECURITY: Single atomic write. Persist vault entries, master wrapper,
      // optional vault-key-encrypted API key, and DROP the legacy
      // password-encrypted API key ciphertext (C-3 + C-4). If the SW dies
      // mid-write, chrome.storage.local.set is atomic at the chrome layer.
      const storageData: Record<string, unknown> = {
        encryptedVaultKeyMaster,
        agentPasswordEnabled: false,
        encryptedApiKey: null,
      };
      if (updatedVault) {
        storageData[VAULT_STORAGE_KEY] = updatedVault;
      }
      if (encryptedApiKeyVault) {
        storageData.encryptedApiKeyVault = encryptedApiKeyVault;
      }
      await chrome.storage.local.set(storageData);

      // Cache only the key whose wrapper/data write actually committed.
      setCachedVaultKey(vaultKey);
    });

    console.log(
      "Migration to vault key system completed (API key + private keys)",
    );
  } catch (error) {
    console.error("Failed to migrate to vault key system:", error);
    // Continue without migration - will try again next unlock
  }
}
