import {
  IV_LENGTH,
  SALT_LENGTH,
  arrayBufferToBase64,
  decodeBase64Bounded,
  decodeBase64Exact,
  deriveKey,
} from "../cryptoUtils";
import type {
  LegacyEncryptedMnemonic,
  MnemonicKeyCheck,
  MnemonicKeyEncryptedMnemonic,
} from "./record";

const MNEMONIC_AAD_PREFIX = "walletchan/mnemonic/v2";
const MNEMONIC_KEY_CHECK_PLAINTEXT = "walletchan/mnemonic-key-check/v2";

export async function encryptMnemonicWithPassword(
  mnemonic: string,
  password: string,
): Promise<LegacyEncryptedMnemonic> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(mnemonic),
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
  };
}

export async function decryptMnemonicWithPassword(
  keystore: LegacyEncryptedMnemonic,
  password: string,
): Promise<string> {
  if (!keystore.salt) throw new Error("Password-encrypted mnemonic has no salt");
  const salt = decodeBase64Exact(keystore.salt, SALT_LENGTH);
  const iv = decodeBase64Exact(keystore.iv, IV_LENGTH);
  const ciphertext = decodeBase64Bounded(keystore.ciphertext, 16, 1024);
  if (!salt || !iv || !ciphertext) {
    throw new Error("Mnemonic keystore is malformed");
  }
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

function mnemonicAad(keyId: string, seedGroupId: string): ArrayBuffer {
  return new TextEncoder().encode(
    `${MNEMONIC_AAD_PREFIX}/${keyId}/${seedGroupId}`,
  ).buffer as ArrayBuffer;
}

function mnemonicKeyCheckAad(keyId: string): ArrayBuffer {
  return new TextEncoder().encode(`${MNEMONIC_AAD_PREFIX}/${keyId}/key-check`)
    .buffer as ArrayBuffer;
}

export async function createMnemonicKeyCheck(
  key: CryptoKey,
  keyId: string,
): Promise<MnemonicKeyCheck> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: mnemonicKeyCheckAad(keyId),
    },
    key,
    new TextEncoder().encode(MNEMONIC_KEY_CHECK_PLAINTEXT),
  );
  return {
    version: 2,
    scheme: "mnemonic-key-check",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function verifyMnemonicKeyCheck(
  check: MnemonicKeyCheck,
  key: CryptoKey,
  keyId: string,
): Promise<boolean> {
  try {
    const iv = decodeBase64Exact(check.iv, IV_LENGTH);
    const ciphertext = decodeBase64Bounded(check.ciphertext, 16, 256);
    if (!iv || !ciphertext) return false;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer as ArrayBuffer,
        additionalData: mnemonicKeyCheckAad(keyId),
      },
      key,
      ciphertext.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext) === MNEMONIC_KEY_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

export async function encryptMnemonicWithKey(
  mnemonic: string,
  seedGroupId: string,
  key: CryptoKey,
  keyId: string,
): Promise<MnemonicKeyEncryptedMnemonic> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: mnemonicAad(keyId, seedGroupId),
    },
    key,
    new TextEncoder().encode(mnemonic),
  );
  return {
    version: 2,
    scheme: "mnemonic-key",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function decryptMnemonicWithKey(
  keystore: MnemonicKeyEncryptedMnemonic,
  seedGroupId: string,
  key: CryptoKey,
  keyId: string,
): Promise<string> {
  const iv = decodeBase64Exact(keystore?.iv, IV_LENGTH);
  const ciphertext = decodeBase64Bounded(keystore?.ciphertext, 16, 1024);
  if (!iv || !ciphertext) {
    throw new Error("Mnemonic keystore is malformed");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv.buffer as ArrayBuffer,
      additionalData: mnemonicAad(keyId, seedGroupId),
    },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

export async function decryptTransitionalSharedVaultEntry(
  keystore: LegacyEncryptedMnemonic,
  vaultKey: CryptoKey,
): Promise<string> {
  const iv = decodeBase64Exact(keystore?.iv, IV_LENGTH);
  const ciphertext = decodeBase64Bounded(keystore?.ciphertext, 16, 1024);
  if (!iv || !ciphertext) {
    throw new Error("Mnemonic keystore is malformed");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    vaultKey,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}
