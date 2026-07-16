import {
  IV_LENGTH,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
} from "../cryptoUtils";
import {
  MAX_MNEMONIC_KEY_ID_LENGTH,
  PASSKEY_PRF_BYTE_LENGTH,
  PASSKEY_RP_ID,
  decodePasskeyBase64Url,
  isValidPasskeyCredentialPayload,
  type PasskeyCredentialPayload,
  type PasskeyUnlockRecord,
  type PasskeyWrappedKey,
} from "./record";

async function decodePrfKeyMaterial(
  prfKeyMaterial: string,
): Promise<Uint8Array | null> {
  try {
    const bytes = decodePasskeyBase64Url(prfKeyMaterial);
    if (bytes?.byteLength !== PASSKEY_PRF_BYTE_LENGTH) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function importLegacyPrfKey(
  prfKeyMaterial: string,
): Promise<CryptoKey | null> {
  const bytes = await decodePrfKeyMaterial(prfKeyMaterial);
  if (!bytes) return null;
  try {
    return await crypto.subtle.importKey(
      "raw",
      new Uint8Array(bytes).buffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

async function derivePasskeySubkey(
  prfKeyMaterial: string,
  purpose: "vault" | "mnemonic",
): Promise<CryptoKey | null> {
  const bytes = await decodePrfKeyMaterial(prfKeyMaterial);
  if (!bytes) return null;
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
        salt: new Uint8Array(32),
        info: new TextEncoder().encode(`walletchan/passkey/v2/${purpose}`),
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

async function wrapKeyBytes(
  keyBytes: Uint8Array,
  wrappingKey: CryptoKey,
): Promise<PasskeyWrappedKey | null> {
  const key = wrappingKey;
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    keyBytes.slice().buffer as ArrayBuffer,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

async function unwrapKeyBytes(
  wrappedKey: PasskeyWrappedKey,
  key: CryptoKey,
): Promise<Uint8Array | null> {
  try {
    const iv = base64ToUint8Array(wrappedKey.iv);
    const ciphertext = base64ToArrayBuffer(wrappedKey.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext,
    );
    const bytes = new Uint8Array(plaintext);
    return bytes.byteLength === PASSKEY_PRF_BYTE_LENGTH ? bytes : null;
  } catch {
    return null;
  }
}

export interface UnwrappedPasskeyRecordKeys {
  vaultKeyBytes: Uint8Array;
  mnemonicKeyBytes?: Uint8Array;
  mnemonicKeyId?: string;
}

export async function unwrapPasskeyRecordKeys(
  record: PasskeyUnlockRecord,
  prfKeyMaterial: string,
): Promise<UnwrappedPasskeyRecordKeys | null> {
  if (record.version === 1) {
    const key = await importLegacyPrfKey(prfKeyMaterial);
    if (!key) return null;
    const vaultKeyBytes = await unwrapKeyBytes(record.wrappedVaultKey, key);
    return vaultKeyBytes ? { vaultKeyBytes } : null;
  }

  const [vaultWrappingKey, mnemonicWrappingKey] = await Promise.all([
    derivePasskeySubkey(prfKeyMaterial, "vault"),
    derivePasskeySubkey(prfKeyMaterial, "mnemonic"),
  ]);
  if (!vaultWrappingKey || !mnemonicWrappingKey) return null;
  const [vaultKeyBytes, mnemonicKeyBytes] = await Promise.all([
    unwrapKeyBytes(record.wrappedVaultKey, vaultWrappingKey),
    unwrapKeyBytes(record.wrappedMnemonicKey, mnemonicWrappingKey),
  ]);
  if (!vaultKeyBytes || !mnemonicKeyBytes) return null;
  return {
    vaultKeyBytes,
    mnemonicKeyBytes,
    mnemonicKeyId: record.mnemonicKeyId,
  };
}

export async function buildPasskeyRecord(
  payload: Partial<PasskeyCredentialPayload>,
  vaultKeyBytes: Uint8Array,
  mnemonic?: { keyBytes: Uint8Array; keyId: string },
): Promise<{ success: boolean; error?: string; record?: PasskeyUnlockRecord }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }
  if (
    vaultKeyBytes.byteLength !== PASSKEY_PRF_BYTE_LENGTH ||
    (mnemonic &&
      (mnemonic.keyBytes.byteLength !== PASSKEY_PRF_BYTE_LENGTH ||
        !mnemonic.keyId ||
        mnemonic.keyId.length > MAX_MNEMONIC_KEY_ID_LENGTH))
  ) {
    return { success: false, error: "Invalid wallet key material" };
  }

  const vaultWrappingKey = mnemonic
    ? await derivePasskeySubkey(payload.prfKeyMaterial, "vault")
    : await importLegacyPrfKey(payload.prfKeyMaterial);
  if (!vaultWrappingKey) {
    return {
      success: false,
      error: "Biometric unlock is not supported on this device",
    };
  }
  const wrappedVaultKey = await wrapKeyBytes(vaultKeyBytes, vaultWrappingKey);
  if (!wrappedVaultKey) {
    return {
      success: false,
      error: "Biometric unlock is not supported on this device",
    };
  }

  if (mnemonic) {
    const mnemonicWrappingKey = await derivePasskeySubkey(
      payload.prfKeyMaterial,
      "mnemonic",
    );
    if (!mnemonicWrappingKey) {
      return {
        success: false,
        error: "Biometric unlock is not supported on this device",
      };
    }
    const wrappedMnemonicKey = await wrapKeyBytes(
      mnemonic.keyBytes,
      mnemonicWrappingKey,
    );
    if (!wrappedMnemonicKey) {
      return {
        success: false,
        error: "Failed to protect seed phrases for biometric unlock",
      };
    }
    return {
      success: true,
      record: {
        version: 2,
        rpId: PASSKEY_RP_ID,
        credentialId: payload.credentialId,
        prfSalt: payload.prfSalt,
        wrappedVaultKey,
        wrappedMnemonicKey,
        mnemonicKeyId: mnemonic.keyId,
        createdAt: Date.now(),
      },
    };
  }

  return {
    success: true,
    record: {
      version: 1,
      rpId: PASSKEY_RP_ID,
      credentialId: payload.credentialId,
      prfSalt: payload.prfSalt,
      wrappedVaultKey,
      createdAt: Date.now(),
    },
  };
}
