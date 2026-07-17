import { base64ToUint8Array } from "../cryptoUtils";

// Internal metadata marker only. WebAuthn omits rp.id/rpId so Chrome uses the
// extension origin as the relying party in native passkey prompts.
export const PASSKEY_RP_ID = "extension";

export interface PasskeyWrappedKey {
  ciphertext: string;
  iv: string;
}

/**
 * Compatibility decoder for pre-release/local development profiles. No
 * published WalletChan extension version emitted V1 passkey records; the UI
 * deliberately requires reconfiguration before new local-account setup.
 */
export interface PasskeyUnlockRecordV1 {
  version: 1;
  rpId: string;
  credentialId: string;
  prfSalt: string;
  wrappedVaultKey: PasskeyWrappedKey;
  createdAt: number;
  lastUsedAt?: number;
}

export interface PasskeyUnlockRecordV2 {
  version: 2;
  rpId: string;
  credentialId: string;
  prfSalt: string;
  wrappedVaultKey: PasskeyWrappedKey;
  wrappedMnemonicKey: PasskeyWrappedKey;
  mnemonicKeyId: string;
  createdAt: number;
  lastUsedAt?: number;
}

export type PasskeyUnlockRecord =
  | PasskeyUnlockRecordV1
  | PasskeyUnlockRecordV2;

export interface PasskeyCredentialPayload {
  credentialId: string;
  prfSalt: string;
  prfKeyMaterial: string;
  authCeremonyEpoch: string;
}

export const PASSKEY_PRF_BYTE_LENGTH = 32;

const PASSKEY_IV_BYTE_LENGTH = 12;
const WRAPPED_VAULT_KEY_BYTE_LENGTH = 48;
const MAX_CREDENTIAL_ID_BYTE_LENGTH = 1023;
const MAX_CREDENTIAL_ID_BASE64URL_LENGTH = 1_400;
const MAX_AUTH_CEREMONY_EPOCH_LENGTH = 128;
export const MAX_MNEMONIC_KEY_ID_LENGTH = 128;

function base64UrlToBase64(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  return padding === 0 ? padded : `${padded}${"=".repeat(4 - padding)}`;
}

export function decodePasskeyBase64Url(value: unknown): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CREDENTIAL_ID_BASE64URL_LENGTH ||
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
  const decoded = decodePasskeyBase64Url(value);
  return decoded?.byteLength === expectedLength;
}

function hasStandardBase64Length(
  value: unknown,
  expectedLength: number,
): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const expectedEncodedLength = Math.ceil(expectedLength / 3) * 4;
  if (value.length !== expectedEncodedLength) return false;
  try {
    return base64ToUint8Array(value).byteLength === expectedLength;
  } catch {
    return false;
  }
}

export function isValidPasskeyCredentialPayload(
  payload: Partial<PasskeyCredentialPayload>,
): payload is PasskeyCredentialPayload {
  const credentialId = decodePasskeyBase64Url(payload.credentialId);
  return (
    credentialId !== null &&
    credentialId.byteLength > 0 &&
    credentialId.byteLength <= MAX_CREDENTIAL_ID_BYTE_LENGTH &&
    hasDecodedLength(payload.prfSalt, PASSKEY_PRF_BYTE_LENGTH) &&
    hasDecodedLength(payload.prfKeyMaterial, PASSKEY_PRF_BYTE_LENGTH) &&
    typeof payload.authCeremonyEpoch === "string" &&
    payload.authCeremonyEpoch.length > 0 &&
    payload.authCeremonyEpoch.length <= MAX_AUTH_CEREMONY_EPOCH_LENGTH
  );
}

export function isValidPasskeyUnlockRecord(
  record: unknown,
): record is PasskeyUnlockRecord {
  if (typeof record !== "object" || record === null) return false;
  const candidate = record as Partial<PasskeyUnlockRecord>;
  const credentialId = decodePasskeyBase64Url(candidate.credentialId);

  return (
    (candidate.version === 1 || candidate.version === 2) &&
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
    (candidate.version === 1 ||
      (typeof (candidate as Partial<PasskeyUnlockRecordV2>).mnemonicKeyId ===
        "string" &&
        ((candidate as Partial<PasskeyUnlockRecordV2>).mnemonicKeyId?.length ??
          0) > 0 &&
        ((candidate as Partial<PasskeyUnlockRecordV2>).mnemonicKeyId?.length ??
          0) <= MAX_MNEMONIC_KEY_ID_LENGTH &&
        hasStandardBase64Length(
          (candidate as Partial<PasskeyUnlockRecordV2>).wrappedMnemonicKey?.iv,
          PASSKEY_IV_BYTE_LENGTH,
        ) &&
        hasStandardBase64Length(
          (candidate as Partial<PasskeyUnlockRecordV2>).wrappedMnemonicKey
            ?.ciphertext,
          WRAPPED_VAULT_KEY_BYTE_LENGTH,
        ))) &&
    typeof candidate.createdAt === "number" &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    (candidate.lastUsedAt === undefined ||
      (typeof candidate.lastUsedAt === "number" &&
        Number.isFinite(candidate.lastUsedAt) &&
        candidate.lastUsedAt >= 0))
  );
}
