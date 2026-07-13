/**
 * Vault encryption utilities for private key storage
 * Uses PBKDF2 + AES-256-GCM for secure encryption (same as crypto.ts)
 *
 * CRITICAL: Decryption functions should ONLY be called from background.ts
 * Private keys must NEVER leave the background service worker context
 */

import type { Vault, VaultEntry, DecryptedEntry } from "./types";
import {
  decryptPrivateKey,
  decryptPrivateKeyWithVaultKey,
  encryptPrivateKey,
  encryptPrivateKeyWithVaultKey,
  isVaultKeyEncrypted,
  type PasswordEncryptedPrivateKey,
  type VaultKeyEncryptedPrivateKey,
} from "./privateKeyVaultCrypto";
export {
  decryptPrivateKey,
  decryptPrivateKeyWithVaultKey,
  encryptPrivateKey,
  encryptPrivateKeyWithVaultKey,
  isVaultKeyEncrypted,
} from "./privateKeyVaultCrypto";
import {
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "./storageLock";
import { assertCurrentMasterAuthorization } from "./masterAuthorization";
import { getAccounts } from "./accountStorage";
import { retainValidLocalAccountKeys } from "./privateKeyIntegrity";

export const VAULT_STORAGE_KEY = "pkVault";

/**
 * Loads the vault from chrome storage
 */
export async function loadVault(): Promise<Vault | null> {
  const result = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  return result[VAULT_STORAGE_KEY] || null;
}

/**
 * Saves the vault to chrome storage
 */
export async function saveVault(vault: Vault): Promise<void> {
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
}

/**
 * Creates an empty vault
 */
function createEmptyVault(): Vault {
  return {
    version: 1,
    entries: [],
  };
}

/**
 * Adds an encrypted private key to the vault
 * Uses vault key encryption if available, otherwise falls back to password encryption
 */
export async function addKeyToVault(
  accountId: string,
  privateKey: `0x${string}`,
  password?: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, async () => {
    if (expectedAuthEpoch) {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    }
    let vault = await loadVault();
    if (!vault) {
      vault = createEmptyVault();
    }

  // Check if entry already exists
    const existingIndex = vault.entries.findIndex((e) => e.id === accountId);
    if (existingIndex !== -1) {
      throw new Error("Account already exists in vault");
    }

  // Check if vault key system is active. A migrated wallet must never create a
  // new password-encrypted entry merely because its in-memory vault key
  // expired between authorization and persistence. Mixed legacy entries are
  // supported only for reading/migrating older storage.
    const { getCachedVaultKey } = await import("./sessionCache");
    const vaultKey = getCachedVaultKey();
    const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
      "encryptedVaultKeyMaster",
    );

  // Encrypt the private key
    let keystore: PasswordEncryptedPrivateKey | VaultKeyEncryptedPrivateKey;
    if (vaultKey) {
      // Use vault key encryption (agent password compatible)
      keystore = await encryptPrivateKeyWithVaultKey(privateKey, vaultKey);
    } else {
      if (encryptedVaultKeyMaster) {
        throw new Error("Wallet is locked. Please unlock again.");
      }
      if (!password) {
        throw new Error("Wallet is locked. Please unlock first.");
      }
      // Fall back to password encryption (legacy)
      keystore = await encryptPrivateKey(privateKey, password);
    }

  // Add to vault
    const entry: VaultEntry = {
      id: accountId,
      keystore,
    };
    vault.entries.push(entry);

    if (expectedAuthEpoch) {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    }
    await saveVault(vault);
  });
}

/**
 * Removes a private key from the vault
 */
export async function removeKeyFromVault(
  accountId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, async () => {
    if (expectedAuthEpoch) {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    }
    const vault = await loadVault();
    if (!vault) {
      return;
    }

    vault.entries = vault.entries.filter((e) => e.id !== accountId);
    if (expectedAuthEpoch) {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    }
    await saveVault(vault);
  });
}

/**
 * Decrypts all private keys in the vault
 * CRITICAL: Only call from background.ts for caching
 */
export async function decryptAllKeys(
  password: string
): Promise<DecryptedEntry[] | null> {
  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return [];
  }

  try {
    const decrypted: DecryptedEntry[] = [];
    for (const entry of vault.entries) {
      const privateKey = await decryptPrivateKey(entry.keystore as PasswordEncryptedPrivateKey, password);
      decrypted.push({
        id: entry.id,
        privateKey,
      });
    }
    return retainValidLocalAccountKeys(decrypted, await getAccounts());
  } catch {
    // Wrong password
    return null;
  }
}

/**
 * Re-encrypts all vault entries with a new password
 * Used when changing the wallet password
 */
export async function reEncryptVault(
  oldPassword: string,
  newPassword: string
): Promise<boolean> {
  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return true; // Nothing to re-encrypt
  }

  try {
    const newEntries: VaultEntry[] = [];
    for (const entry of vault.entries) {
      // Decrypt with old password
      const privateKey = await decryptPrivateKey(entry.keystore as PasswordEncryptedPrivateKey, oldPassword);
      // Re-encrypt with new password
      const newKeystore = await encryptPrivateKey(privateKey, newPassword);
      newEntries.push({
        id: entry.id,
        keystore: newKeystore,
      });
    }

    // Save the re-encrypted vault
    vault.entries = newEntries;
    await saveVault(vault);
    return true;
  } catch {
    // Failed to decrypt (wrong old password)
    return false;
  }
}

/**
 * Computes re-encrypted vault data in memory without writing to storage.
 * Returns the new vault object, or null on failure.
 * Used by atomic password change to prepare all data before a single write.
 */
export async function computeReEncryptedVault(
  oldPassword: string,
  newPassword: string
): Promise<Vault | null> {
  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return null;
  }

  try {
    const newEntries: VaultEntry[] = [];
    for (const entry of vault.entries) {
      const privateKey = await decryptPrivateKey(entry.keystore as PasswordEncryptedPrivateKey, oldPassword);
      const newKeystore = await encryptPrivateKey(privateKey, newPassword);
      newEntries.push({ id: entry.id, keystore: newKeystore });
    }
    return { ...vault, entries: newEntries };
  } catch {
    return null;
  }
}

/**
 * Computes a vault where every entry is encrypted by the supplied vault key.
 *
 * A partially migrated wallet may contain both vault-key entries and legacy
 * password entries. Existing vault-key entries are preserved byte-for-byte;
 * only legacy entries are decrypted with the master password and migrated.
 * Nothing is written until the caller persists the returned vault.
 */
export async function computeVaultKeyMigratedVault(
  password: string,
  vaultKey: CryptoKey,
): Promise<Vault | null> {
  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return null;
  }

  try {
    const entries = await Promise.all(
      vault.entries.map(async (entry): Promise<VaultEntry> => {
        if (isVaultKeyEncrypted(entry.keystore)) {
          return entry;
        }

        const privateKey = await decryptPrivateKey(
          entry.keystore as PasswordEncryptedPrivateKey,
          password,
        );
        return {
          id: entry.id,
          keystore: await encryptPrivateKeyWithVaultKey(privateKey, vaultKey),
        };
      }),
    );

    return { ...vault, entries };
  } catch {
    return null;
  }
}

/**
 * Clears the entire vault
 */
export async function clearVault(): Promise<void> {
  await chrome.storage.local.remove(VAULT_STORAGE_KEY);
}

/**
 * Checks if the vault has any entries
 */
export async function hasVaultEntries(): Promise<boolean> {
  const vault = await loadVault();
  return vault !== null && vault.entries.length > 0;
}
