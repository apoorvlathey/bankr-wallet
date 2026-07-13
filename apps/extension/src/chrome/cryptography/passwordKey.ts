/** Password-derived AES key policy for all released V1 credential records. */

import { isBoundedExistingPassword } from "@/constants/securityPolicy";

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;

export async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  if (!isBoundedExistingPassword(password)) {
    throw new Error("Invalid password");
  }
  const passwordBuffer = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
