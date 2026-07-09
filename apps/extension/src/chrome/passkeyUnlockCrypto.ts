import {
  IV_LENGTH,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
} from "./cryptoUtils";

export const PASSKEY_UNLOCK_STORAGE_KEY = "passkeyUnlock";

// Internal metadata marker only. WebAuthn omits rp.id/rpId so Chrome uses the
// extension origin as the relying party in native passkey prompts.
export const PASSKEY_RP_ID = "extension";

interface PasskeyWrappedVaultKey {
  ciphertext: string;
  iv: string;
}

export interface PasskeyUnlockRecord {
  version: 1;
  rpId: string;
  credentialId: string;
  prfSalt: string;
  wrappedVaultKey: PasskeyWrappedVaultKey;
  createdAt: number;
  lastUsedAt?: number;
}

export interface PasskeyCredentialPayload {
  credentialId: string;
  prfSalt: string;
  prfKeyMaterial: string;
  authCeremonyEpoch: string;
}

const PASSKEY_PRF_BYTE_LENGTH = 32;
const PASSKEY_IV_BYTE_LENGTH = 12;
const WRAPPED_VAULT_KEY_BYTE_LENGTH = 48;
const MAX_CREDENTIAL_ID_BYTE_LENGTH = 1023;

function base64UrlToBase64(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  return padding === 0 ? padded : `${padded}${"=".repeat(4 - padding)}`;
}

function decodeBase64Url(value: unknown): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    return base64ToUint8Array(base64UrlToBase64(value));
  } catch {
    return null;
  }
}

function hasDecodedLength(value: unknown, expectedLength: number): boolean {
  const decoded = decodeBase64Url(value);
  return decoded?.byteLength === expectedLength;
}

function hasStandardBase64Length(value: unknown, expectedLength: number): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    return base64ToUint8Array(value).byteLength === expectedLength;
  } catch {
    return false;
  }
}

export function isValidPasskeyCredentialPayload(
  payload: Partial<PasskeyCredentialPayload>,
): payload is PasskeyCredentialPayload {
  const credentialId = decodeBase64Url(payload.credentialId);
  return (
    credentialId !== null &&
    credentialId.byteLength > 0 &&
    credentialId.byteLength <= MAX_CREDENTIAL_ID_BYTE_LENGTH &&
    hasDecodedLength(payload.prfSalt, PASSKEY_PRF_BYTE_LENGTH) &&
    hasDecodedLength(payload.prfKeyMaterial, PASSKEY_PRF_BYTE_LENGTH) &&
    typeof payload.authCeremonyEpoch === "string" &&
    payload.authCeremonyEpoch.length > 0
  );
}

export function isValidPasskeyUnlockRecord(
  record: unknown,
): record is PasskeyUnlockRecord {
  if (typeof record !== "object" || record === null) return false;
  const candidate = record as Partial<PasskeyUnlockRecord>;
  const credentialId = decodeBase64Url(candidate.credentialId);

  return (
    candidate.version === 1 &&
    candidate.rpId === PASSKEY_RP_ID &&
    credentialId !== null &&
    credentialId.byteLength > 0 &&
    credentialId.byteLength <= MAX_CREDENTIAL_ID_BYTE_LENGTH &&
    hasDecodedLength(candidate.prfSalt, PASSKEY_PRF_BYTE_LENGTH) &&
    hasStandardBase64Length(
      candidate.wrappedVaultKey?.iv,
      PASSKEY_IV_BYTE_LENGTH,
    ) &&
    hasStandardBase64Length(
      candidate.wrappedVaultKey?.ciphertext,
      WRAPPED_VAULT_KEY_BYTE_LENGTH,
    ) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    (candidate.lastUsedAt === undefined ||
      (typeof candidate.lastUsedAt === "number" &&
        Number.isFinite(candidate.lastUsedAt) &&
        candidate.lastUsedAt >= 0))
  );
}

export async function loadPasskeyUnlockRecord(): Promise<PasskeyUnlockRecord | null> {
  const result = await chrome.storage.local.get(PASSKEY_UNLOCK_STORAGE_KEY);
  const record = result[PASSKEY_UNLOCK_STORAGE_KEY] as
    | PasskeyUnlockRecord
    | null
    | undefined;

  return isValidPasskeyUnlockRecord(record) ? record : null;
}

async function importPrfKey(prfKeyMaterial: string): Promise<CryptoKey | null> {
  try {
    const bytes = decodeBase64Url(prfKeyMaterial);
    if (bytes?.byteLength !== PASSKEY_PRF_BYTE_LENGTH) return null;
    return await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

async function wrapVaultKey(
  vaultKeyBytes: Uint8Array,
  prfKeyMaterial: string,
): Promise<PasskeyWrappedVaultKey | null> {
  const key = await importPrfKey(prfKeyMaterial);
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    vaultKeyBytes.buffer as ArrayBuffer,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

export async function unwrapVaultKey(
  wrappedVaultKey: PasskeyWrappedVaultKey,
  prfKeyMaterial: string,
): Promise<Uint8Array | null> {
  const key = await importPrfKey(prfKeyMaterial);
  if (!key) return null;

  try {
    const iv = base64ToUint8Array(wrappedVaultKey.iv);
    const ciphertext = base64ToArrayBuffer(wrappedVaultKey.ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

export async function buildPasskeyRecord(
  payload: Partial<PasskeyCredentialPayload>,
  vaultKeyBytes: Uint8Array,
): Promise<{ success: boolean; error?: string; record?: PasskeyUnlockRecord }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }

  const wrappedVaultKey = await wrapVaultKey(
    vaultKeyBytes,
    payload.prfKeyMaterial,
  );
  if (!wrappedVaultKey) {
    return {
      success: false,
      error: "Biometric unlock is not supported on this device",
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

export async function savePasskeyRecord(
  record: PasskeyUnlockRecord,
): Promise<void> {
  await chrome.storage.local.set({ [PASSKEY_UNLOCK_STORAGE_KEY]: record });
}
