import { decodeBase64Exact } from "../cryptoUtils";

export const SESSION_KEY_BYTES = 32;

export async function importSessionEncryptionKey(
  value: unknown,
): Promise<CryptoKey | null> {
  const sessionKey = decodeBase64Exact(value, SESSION_KEY_BYTES);
  if (!sessionKey) return null;
  try {
    return await crypto.subtle.importKey(
      "raw",
      sessionKey.buffer as ArrayBuffer,
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  } finally {
    sessionKey.fill(0);
  }
}
