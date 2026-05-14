/**
 * Vault encryption utilities for private key storage
 * Uses PBKDF2 + AES-256-GCM for secure encryption (same as crypto.ts)
 *
 * CRITICAL: Decryption functions should ONLY be called from background.ts
 * Private keys must NEVER leave the background service worker context
 */

import type { Vault, VaultEntry, DecryptedEntry } from "./types";
import {
  SALT_LENGTH,
  IV_LENGTH,
  arrayBufferToBase64,
  base64ToUint8Array,
  base64ToArrayBuffer,
  deriveKey,
} from "./cryptoUtils";

export const VAULT_STORAGE_KEY = "pkVault";

interface EncryptedKeystore {
  ciphertext: string; // base64
  iv: string; // base64
  salt: string; // base64
}

/**
 * Vault-key encrypted format (no salt, uses vault key directly)
 */
interface EncryptedKeystoreVault {
  ciphertext: string; // base64
  iv: string; // base64
  salt: ""; // Empty salt indicates vault-key encryption
}

/**
 * Encrypts a private key using AES-256-GCM
 */
export async function encryptPrivateKey(
  privateKey: `0x${string}`,
  password: string
): Promise<EncryptedKeystore> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(privateKey)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

/**
 * Decrypts a keystore to get the private key
 * CRITICAL: Only call from background.ts
 */
export async function decryptPrivateKey(
  keystore: EncryptedKeystore,
  password: string
): Promise<`0x${string}`> {
  const decoder = new TextDecoder();
  const salt = base64ToUint8Array(keystore.salt);
  const iv = base64ToUint8Array(keystore.iv);
  const ciphertext = base64ToArrayBuffer(keystore.ciphertext);

  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext
  );

  return decoder.decode(plaintext) as `0x${string}`;
}

/**
 * Checks if a keystore is encrypted with vault key (empty salt)
 */
export function isVaultKeyEncrypted(keystore: any): keystore is EncryptedKeystoreVault {
  return keystore && keystore.salt === "";
}

/**
 * Encrypts a private key using vault key (no password derivation needed)
 */
export async function encryptPrivateKeyWithVaultKey(
  privateKey: `0x${string}`,
  vaultKey: CryptoKey
): Promise<EncryptedKeystoreVault> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    encoder.encode(privateKey)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: "", // Empty salt indicates vault-key encryption
  };
}

/**
 * Decrypts a vault-key encrypted keystore to get the private key
 * CRITICAL: Only call from background.ts
 */
export async function decryptPrivateKeyWithVaultKey(
  keystore: EncryptedKeystoreVault,
  vaultKey: CryptoKey
): Promise<`0x${string}` | null> {
  try {
    const decoder = new TextDecoder();
    const iv = base64ToUint8Array(keystore.iv);
    const ciphertext = base64ToArrayBuffer(keystore.ciphertext);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      vaultKey,
      ciphertext
    );

    return decoder.decode(plaintext) as `0x${string}`;
  } catch {
    return null;
  }
}

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
  password: string
): Promise<void> {
  let vault = await loadVault();
  if (!vault) {
    vault = createEmptyVault();
  }

  // Check if entry already exists
  const existingIndex = vault.entries.findIndex((e) => e.id === accountId);
  if (existingIndex !== -1) {
    throw new Error("Account already exists in vault");
  }

  // Check if vault key system is active
  const { getCachedVaultKey } = await import("./sessionCache");
  const vaultKey = getCachedVaultKey();

  // Encrypt the private key
  let keystore: EncryptedKeystore | EncryptedKeystoreVault;
  if (vaultKey) {
    // Use vault key encryption (agent password compatible)
    keystore = await encryptPrivateKeyWithVaultKey(privateKey, vaultKey);
  } else {
    // Fall back to password encryption (legacy)
    keystore = await encryptPrivateKey(privateKey, password);
  }

  // Add to vault
  const entry: VaultEntry = {
    id: accountId,
    keystore,
  };
  vault.entries.push(entry);

  await saveVault(vault);
}

/**
 * Removes a private key from the vault
 */
export async function removeKeyFromVault(accountId: string): Promise<void> {
  const vault = await loadVault();
  if (!vault) {
    return;
  }

  vault.entries = vault.entries.filter((e) => e.id !== accountId);
  await saveVault(vault);
}

/**
 * Gets an encrypted keystore entry from the vault
 */
export async function getKeystoreEntry(
  accountId: string
): Promise<VaultEntry | null> {
  const vault = await loadVault();
  if (!vault) {
    return null;
  }

  return vault.entries.find((e) => e.id === accountId) || null;
}

/**
 * Decrypts a single private key from the vault
 * CRITICAL: Only call from background.ts
 */
export async function getPrivateKey(
  accountId: string,
  password: string
): Promise<`0x${string}` | null> {
  const entry = await getKeystoreEntry(accountId);
  if (!entry) {
    return null;
  }

  try {
    return await decryptPrivateKey(entry.keystore as EncryptedKeystore, password);
  } catch {
    // Wrong password or corrupted keystore
    return null;
  }
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
      const privateKey = await decryptPrivateKey(entry.keystore as EncryptedKeystore, password);
      decrypted.push({
        id: entry.id,
        privateKey,
      });
    }
    return decrypted;
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
      const privateKey = await decryptPrivateKey(entry.keystore as EncryptedKeystore, oldPassword);
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
      const privateKey = await decryptPrivateKey(entry.keystore as EncryptedKeystore, oldPassword);
      const newKeystore = await encryptPrivateKey(privateKey, newPassword);
      newEntries.push({ id: entry.id, keystore: newKeystore });
    }
    return { ...vault, entries: newEntries };
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
