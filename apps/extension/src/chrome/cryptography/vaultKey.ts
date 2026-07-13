/** Random vault-key generation, password wrapping, and direct AES-GCM use. */

import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "./base64";
import { deriveKey, IV_LENGTH, SALT_LENGTH } from "./passwordKey";
import type { EncryptedData } from "./types";

const VAULT_KEY_LENGTH = 32;

export function generateVaultKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(VAULT_KEY_LENGTH));
}

export async function encryptVaultKey(
  vaultKey: Uint8Array,
  password: string,
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
    vaultKey.slice().buffer as ArrayBuffer,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

export async function tryDecryptVaultKey(
  encryptedVaultKey: EncryptedData | null | undefined,
  password: string,
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

export async function importVaultKey(
  vaultKeyBytes: Uint8Array,
): Promise<CryptoKey> {
  if (vaultKeyBytes.byteLength !== VAULT_KEY_LENGTH) {
    throw new Error("Vault key must be exactly 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(vaultKeyBytes).buffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWithVaultKey(
  vaultKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: "",
  };
}

export async function decryptWithVaultKey(
  vaultKey: CryptoKey,
  encryptedData: EncryptedData,
): Promise<string | null> {
  try {
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
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
