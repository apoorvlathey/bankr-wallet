/**
 * Compatibility facade for passkey unlock record handling.
 *
 * Keep this module as the stable import boundary for existing callers while
 * the record codec, key-wrapping cryptography, and storage repository remain
 * independently auditable.
 */

export {
  PASSKEY_PRF_BYTE_LENGTH,
  PASSKEY_RP_ID,
  decodePasskeyBase64Url,
  isValidPasskeyCredentialPayload,
  isValidPasskeyUnlockRecord,
  type PasskeyCredentialPayload,
  type PasskeyUnlockRecord,
  type PasskeyUnlockRecordV1,
  type PasskeyUnlockRecordV2,
  type PasskeyWrappedKey,
} from "./passkey/record";
export {
  buildPasskeyRecord,
  unwrapPasskeyRecordKeys,
} from "./passkey/keyWrapping";
export {
  loadPasskeyUnlockRecord,
  PASSKEY_UNLOCK_STORAGE_KEY,
  savePasskeyRecord,
} from "./passkey/repository";
