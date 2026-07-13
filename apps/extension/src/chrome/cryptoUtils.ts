/**
 * Shared crypto utility functions and constants
 * Used by both crypto.ts (API key encryption) and vaultCrypto.ts (private key encryption)
 */

import { isBoundedExistingPassword } from "@/constants/securityPolicy";

export const PBKDF2_ITERATIONS = 600000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;

/**
 * Converts a Uint8Array to a hexadecimal string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts an ArrayBuffer to a base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to a Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a base64 string to an ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToUint8Array(base64).buffer as ArrayBuffer;
}

/**
 * Decode a fixed-size cryptographic field without first allowing an
 * attacker-controlled storage value to allocate an arbitrary-sized buffer.
 * All WalletChan writers use padded standard base64, so requiring the exact
 * encoded and decoded lengths is backward compatible with every released
 * record format.
 */
export function decodeBase64Exact(
  value: unknown,
  expectedByteLength: number,
): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length !== Math.ceil(expectedByteLength / 3) * 4
  ) {
    return null;
  }
  try {
    const decoded = base64ToUint8Array(value);
    return decoded.byteLength === expectedByteLength ? decoded : null;
  } catch {
    return null;
  }
}

/** Bounded decoder for authenticated ciphertext whose plaintext is variable. */
export function decodeBase64Bounded(
  value: unknown,
  minimumByteLength: number,
  maximumByteLength: number,
): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maximumByteLength / 3) * 4
  ) {
    return null;
  }
  try {
    const decoded = base64ToUint8Array(value);
    return decoded.byteLength >= minimumByteLength &&
      decoded.byteLength <= maximumByteLength
      ? decoded
      : null;
  } catch {
    return null;
  }
}

/**
 * Derives an AES-256-GCM key from a password using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  if (!isBoundedExistingPassword(password)) {
    throw new Error("Invalid password");
  }
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
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
    ["encrypt", "decrypt"]
  );
}
