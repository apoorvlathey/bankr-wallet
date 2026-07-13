/** Password-derived AES-GCM encryption for the released legacy envelope. */

import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "./base64";
import { deriveKey, IV_LENGTH, SALT_LENGTH } from "./passwordKey";
import type { EncryptedData } from "./types";

export async function encrypt(
  plaintext: string,
  password: string,
): Promise<EncryptedData> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

export async function decrypt(
  encryptedData: EncryptedData,
  password: string,
): Promise<string> {
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
  return new TextDecoder().decode(plaintext);
}
