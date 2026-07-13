/** Pure AES-GCM transformations for private-key vault entries. */

import {
  SALT_LENGTH,
  IV_LENGTH,
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
  deriveKey,
} from "./cryptoUtils";

export interface PasswordEncryptedPrivateKey {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface VaultKeyEncryptedPrivateKey {
  ciphertext: string;
  iv: string;
  salt: "";
}

export async function encryptPrivateKey(
  privateKey: `0x${string}`,
  password: string,
): Promise<PasswordEncryptedPrivateKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(privateKey),
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

export async function decryptPrivateKey(
  keystore: PasswordEncryptedPrivateKey,
  password: string,
): Promise<`0x${string}`> {
  const salt = decodeBase64Exact(keystore?.salt, SALT_LENGTH);
  const iv = decodeBase64Exact(keystore?.iv, IV_LENGTH);
  const ciphertext = decodeBase64Bounded(keystore?.ciphertext, 16, 256);
  if (!salt || !iv || !ciphertext) {
    throw new Error("Invalid private-key keystore");
  }
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext) as `0x${string}`;
}

export function isVaultKeyEncrypted(
  keystore: unknown,
): keystore is VaultKeyEncryptedPrivateKey {
  return (
    typeof keystore === "object" &&
    keystore !== null &&
    "salt" in keystore &&
    keystore.salt === ""
  );
}

export async function encryptPrivateKeyWithVaultKey(
  privateKey: `0x${string}`,
  vaultKey: CryptoKey,
): Promise<VaultKeyEncryptedPrivateKey> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    new TextEncoder().encode(privateKey),
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: "",
  };
}

export async function decryptPrivateKeyWithVaultKey(
  keystore: VaultKeyEncryptedPrivateKey,
  vaultKey: CryptoKey,
): Promise<`0x${string}` | null> {
  try {
    if (keystore?.salt !== "") return null;
    const iv = decodeBase64Exact(keystore.iv, IV_LENGTH);
    const ciphertext = decodeBase64Bounded(keystore.ciphertext, 16, 256);
    if (!iv || !ciphertext) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      vaultKey,
      ciphertext.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext) as `0x${string}`;
  } catch {
    return null;
  }
}

