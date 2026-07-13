/** Bounded base64 and byte codecs used by persisted cryptographic records. */

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToUint8Array(base64).buffer as ArrayBuffer;
}

/**
 * Decode a fixed-size cryptographic field before an attacker-controlled
 * storage value can allocate an arbitrary-sized buffer.
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

/** Bounded decoder for authenticated ciphertext with variable plaintext. */
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
