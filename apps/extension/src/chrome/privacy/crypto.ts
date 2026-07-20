import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
} from "../cryptography/base64";
import { decodePasskeyBase64Url } from "../passkey/record";
import {
  PRIVACY_IV_BYTES,
  PRIVACY_KEY_BYTES,
} from "./record";
import type {
  PrivacyEncryptedRecoveryV1,
  PrivacyKeyCheckV1,
  PrivacyWrappedKey,
} from "./types";

const KEY_CHECK_PLAINTEXT = "walletchan-privacy-key-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function recoveryAad(keyId: string): Uint8Array {
  return encoder.encode(`walletchan/privacy-vault/v1/${keyId}/recovery`);
}

function keyCheckAad(keyId: string): Uint8Array {
  return encoder.encode(`walletchan/privacy-vault/v1/${keyId}/key-check`);
}

function passkeyWrapAad(keyId: string): Uint8Array {
  return encoder.encode(`walletchan/passkey/v2/privacy/${keyId}`);
}

async function encryptString(
  key: CryptoKey,
  plaintext: string,
  additionalData: Uint8Array,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(PRIVACY_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: additionalData.buffer as ArrayBuffer,
    },
    key,
    encoder.encode(plaintext),
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

async function decryptString(
  key: CryptoKey,
  encrypted: { ciphertext: string; iv: string },
  additionalData: Uint8Array,
): Promise<string | null> {
  try {
    const iv = decodeBase64Exact(encrypted.iv, PRIVACY_IV_BYTES);
    const ciphertext = decodeBase64Bounded(
      encrypted.ciphertext,
      17,
      1_024,
    );
    if (!iv || !ciphertext) return null;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: additionalData.buffer as ArrayBuffer,
      },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    return decoder.decode(plaintext);
  } catch {
    return null;
  }
}

export function generatePrivacyRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidPrivacyRecoveryPhrase(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    normalized.split(" ").length === 12 &&
    validateMnemonic(normalized, wordlist)
  );
}

export async function encryptPrivacyRecovery(
  key: CryptoKey,
  keyId: string,
  phrase: string,
): Promise<PrivacyEncryptedRecoveryV1> {
  if (!isValidPrivacyRecoveryPhrase(phrase)) {
    throw new Error("Invalid privacy recovery phrase");
  }
  const encrypted = await encryptString(key, phrase, recoveryAad(keyId));
  return { version: 1, scheme: "privacy-key", ...encrypted };
}

export async function decryptPrivacyRecovery(
  key: CryptoKey,
  keyId: string,
  recovery: PrivacyEncryptedRecoveryV1,
): Promise<string | null> {
  const phrase = await decryptString(key, recovery, recoveryAad(keyId));
  return phrase && isValidPrivacyRecoveryPhrase(phrase) ? phrase : null;
}

export async function createPrivacyKeyCheck(
  key: CryptoKey,
  keyId: string,
): Promise<PrivacyKeyCheckV1> {
  const encrypted = await encryptString(
    key,
    KEY_CHECK_PLAINTEXT,
    keyCheckAad(keyId),
  );
  return { version: 1, scheme: "privacy-key-check", ...encrypted };
}

export async function verifyPrivacyKeyCheck(
  key: CryptoKey,
  keyId: string,
  keyCheck: PrivacyKeyCheckV1,
): Promise<boolean> {
  return (
    (await decryptString(key, keyCheck, keyCheckAad(keyId))) ===
    KEY_CHECK_PLAINTEXT
  );
}

async function derivePrivacyPasskeyWrappingKey(
  prfKeyMaterial: string,
): Promise<CryptoKey | null> {
  const bytes = decodePasskeyBase64Url(prfKeyMaterial);
  if (bytes?.byteLength !== PRIVACY_KEY_BYTES) return null;
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(bytes).buffer,
      "HKDF",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(PRIVACY_KEY_BYTES),
        info: encoder.encode("walletchan/passkey/v2/privacy"),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

export async function wrapPrivacyKeyForPasskey(
  keyBytes: Uint8Array,
  keyId: string,
  prfKeyMaterial: string,
): Promise<PrivacyWrappedKey | null> {
  if (keyBytes.byteLength !== PRIVACY_KEY_BYTES) return null;
  const wrappingKey = await derivePrivacyPasskeyWrappingKey(prfKeyMaterial);
  if (!wrappingKey) return null;
  const iv = crypto.getRandomValues(new Uint8Array(PRIVACY_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: passkeyWrapAad(keyId).buffer as ArrayBuffer,
    },
    wrappingKey,
    keyBytes.slice().buffer as ArrayBuffer,
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function unwrapPrivacyKeyFromPasskey(
  wrappedKey: PrivacyWrappedKey,
  keyId: string,
  prfKeyMaterial: string,
): Promise<Uint8Array | null> {
  const wrappingKey = await derivePrivacyPasskeyWrappingKey(prfKeyMaterial);
  if (!wrappingKey) return null;
  try {
    const iv = decodeBase64Exact(wrappedKey.iv, PRIVACY_IV_BYTES);
    const ciphertext = decodeBase64Exact(
      wrappedKey.ciphertext,
      PRIVACY_KEY_BYTES + 16,
    );
    if (!iv || !ciphertext) return null;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: passkeyWrapAad(keyId).buffer as ArrayBuffer,
      },
      wrappingKey,
      ciphertext.buffer as ArrayBuffer,
    );
    const bytes = new Uint8Array(plaintext);
    return bytes.byteLength === PRIVACY_KEY_BYTES ? bytes : null;
  } catch {
    return null;
  }
}
