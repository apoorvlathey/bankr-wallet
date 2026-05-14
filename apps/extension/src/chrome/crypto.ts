/**
 * Encryption utilities for secure API key storage
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 */

import {
  SALT_LENGTH,
  IV_LENGTH,
  arrayBufferToBase64,
  base64ToUint8Array,
  base64ToArrayBuffer,
  deriveKey,
} from "./cryptoUtils";

export interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // base64
  salt: string; // base64
}

/**
 * Encrypts data using AES-256-GCM
 */
export async function encrypt(
  plaintext: string,
  password: string
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

/**
 * Decrypts data using AES-256-GCM
 */
export async function decrypt(
  encryptedData: EncryptedData,
  password: string
): Promise<string> {
  const decoder = new TextDecoder();
  const salt = base64ToUint8Array(encryptedData.salt);
  const iv = base64ToUint8Array(encryptedData.iv);
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);

  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext
  );

  return decoder.decode(plaintext);
}

/**
 * Saves encrypted API key to chrome storage
 */
export async function saveEncryptedApiKey(
  apiKey: string,
  password: string
): Promise<void> {
  const encryptedData = await encrypt(apiKey, password);
  await chrome.storage.local.set({ encryptedApiKey: encryptedData });
}

/**
 * Loads and decrypts API key from chrome storage
 * Tries vault key system first (if available), then falls back to legacy format
 */
export async function loadDecryptedApiKey(
  password: string
): Promise<string | null> {
  // Try vault key system first
  const { getCachedVaultKey } = await import("./sessionCache");
  const vaultKey = getCachedVaultKey();

  if (vaultKey) {
    // Vault key is cached, try to decrypt API key with it
    const { encryptedApiKeyVault } = await chrome.storage.local.get("encryptedApiKeyVault");
    if (encryptedApiKeyVault) {
      const apiKey = await decryptWithVaultKey(vaultKey, encryptedApiKeyVault);
      if (apiKey) {
        return apiKey;
      }
    }
  }

  // Fall back to legacy system (decrypt with password directly)
  const { encryptedApiKey } = (await chrome.storage.local.get(
    "encryptedApiKey"
  )) as { encryptedApiKey: EncryptedData | undefined };

  if (!encryptedApiKey) {
    return null;
  }

  try {
    return await decrypt(encryptedApiKey, password);
  } catch {
    // Decryption failed - likely wrong password
    return null;
  }
}

/**
 * Checks if an encrypted API key exists in storage
 */
export async function hasEncryptedApiKey(): Promise<boolean> {
  const { encryptedApiKey } = await chrome.storage.local.get("encryptedApiKey");
  return !!encryptedApiKey;
}

/**
 * Removes the encrypted API key from storage
 */
export async function removeEncryptedApiKey(): Promise<void> {
  await chrome.storage.local.remove("encryptedApiKey");
}

// === Vault Key System ===
// Instead of encrypting data directly with passwords, we use a vault key:
// Password -> PBKDF2 -> encrypts vault key -> vault key decrypts actual data
// This allows multiple passwords (master + agent) to decrypt the same data

const VAULT_KEY_LENGTH = 32; // 256-bit key

/**
 * Generates a random 256-bit vault key
 */
export function generateVaultKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(VAULT_KEY_LENGTH));
}

/**
 * Encrypts a vault key with a password
 * Uses PBKDF2 + AES-GCM
 */
export async function encryptVaultKey(
  vaultKey: Uint8Array,
  password: string
): Promise<EncryptedData> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    vaultKey.buffer as ArrayBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

/**
 * Attempts to decrypt a vault key with a password
 * Returns null if decryption fails (wrong password)
 */
export async function tryDecryptVaultKey(
  encryptedVaultKey: EncryptedData | null | undefined,
  password: string
): Promise<Uint8Array | null> {
  if (
    !encryptedVaultKey ||
    !encryptedVaultKey.salt ||
    !encryptedVaultKey.iv ||
    !encryptedVaultKey.ciphertext
  ) {
    return null;
  }
  try {
    const salt = base64ToUint8Array(encryptedVaultKey.salt);
    const iv = base64ToUint8Array(encryptedVaultKey.iv);
    const ciphertext = base64ToArrayBuffer(encryptedVaultKey.ciphertext);

    const key = await deriveKey(password, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext
    );

    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

/**
 * Imports a raw vault key bytes as a CryptoKey for encryption/decryption
 */
export async function importVaultKey(vaultKeyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    vaultKeyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts data using a vault key
 */
export async function encryptWithVaultKey(
  vaultKey: CryptoKey,
  plaintext: string
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: "", // No salt needed when using vault key directly
  };
}

/**
 * Decrypts data using a vault key
 * Returns null if decryption fails
 */
export async function decryptWithVaultKey(
  vaultKey: CryptoKey,
  encryptedData: EncryptedData
): Promise<string | null> {
  try {
    const decoder = new TextDecoder();
    const iv = base64ToUint8Array(encryptedData.iv);
    const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      vaultKey,
      ciphertext
    );

    return decoder.decode(plaintext);
  } catch {
    return null;
  }
}

/**
 * Checks if the new vault key system is in use
 */
export async function hasVaultKeySystem(): Promise<boolean> {
  const { encryptedVaultKeyMaster } = await chrome.storage.local.get("encryptedVaultKeyMaster");
  return !!encryptedVaultKeyMaster;
}

/**
 * Checks if agent password is enabled
 */
export async function isAgentPasswordEnabled(): Promise<boolean> {
  const { agentPasswordEnabled } = await chrome.storage.local.get("agentPasswordEnabled");
  return !!agentPasswordEnabled;
}
