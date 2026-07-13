/**
 * Encryption utilities for secure API key storage
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 */

import {
  SALT_LENGTH,
  IV_LENGTH,
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
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
  const salt = decodeBase64Exact(encryptedData?.salt, SALT_LENGTH);
  const iv = decodeBase64Exact(encryptedData?.iv, IV_LENGTH);
  const ciphertext = decodeBase64Bounded(
    encryptedData?.ciphertext,
    16,
    1024 * 1024,
  );
  if (!salt || !iv || !ciphertext) {
    throw new Error("Invalid encrypted data");
  }

  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );

  return decoder.decode(plaintext);
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
 * Checks if an encrypted API key exists in storage (legacy or vault-key form).
 * After the vault-key migration runs (during first unlock), the legacy
 * `encryptedApiKey` is nulled and the credential lives at
 * `encryptedApiKeyVault`. Callers using this as a "wallet is set up" gate
 * must see both.
 */
export async function hasEncryptedApiKey(): Promise<boolean> {
  const { encryptedApiKey, encryptedApiKeyVault } =
    await chrome.storage.local.get(["encryptedApiKey", "encryptedApiKeyVault"]);
  return !!encryptedApiKey || !!encryptedApiKeyVault;
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
  if (vaultKey.byteLength !== VAULT_KEY_LENGTH) {
    throw new Error("Vault key must be exactly 32 bytes");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    vaultKey.slice().buffer as ArrayBuffer
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
    const salt = decodeBase64Exact(encryptedVaultKey.salt, SALT_LENGTH);
    const iv = decodeBase64Exact(encryptedVaultKey.iv, IV_LENGTH);
    // AES-GCM appends a 16-byte tag to the exact 32-byte vault key.
    const ciphertext = decodeBase64Exact(
      encryptedVaultKey.ciphertext,
      VAULT_KEY_LENGTH + 16,
    );
    if (!salt || !iv || !ciphertext) return null;

    const key = await deriveKey(password, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    );

    const result = new Uint8Array(plaintext);
    return result.byteLength === VAULT_KEY_LENGTH ? result : null;
  } catch {
    return null;
  }
}

/**
 * Imports a raw vault key bytes as a CryptoKey for encryption/decryption
 */
export async function importVaultKey(vaultKeyBytes: Uint8Array): Promise<CryptoKey> {
  if (vaultKeyBytes.byteLength !== VAULT_KEY_LENGTH) {
    throw new Error("Vault key must be exactly 32 bytes");
  }
  const rawKey = new Uint8Array(vaultKeyBytes).buffer;
  return crypto.subtle.importKey(
    "raw",
    rawKey,
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
    if (encryptedData?.salt !== "") return null;
    const iv = decodeBase64Exact(encryptedData.iv, IV_LENGTH);
    const ciphertext = decodeBase64Bounded(
      encryptedData.ciphertext,
      16,
      1024 * 1024,
    );
    if (!iv || !ciphertext) return null;

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      vaultKey,
      ciphertext.buffer as ArrayBuffer,
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
