/**
 * Compatibility facade for biometric/passkey orchestration.
 *
 * Existing callers retain one stable API while status/preflight, setup,
 * unlock hydration, and removal remain independently auditable boundaries.
 */

export {
  isValidPasskeyCredentialPayload,
  isValidPasskeyUnlockRecord,
  PASSKEY_RP_ID,
  PASSKEY_UNLOCK_STORAGE_KEY,
} from "./passkeyUnlockCrypto";

export type { PasskeyUnlockStatus } from "./passkey/status";
export {
  handleCanSetupPasskeyUnlock,
  handleGetPasskeyUnlockStatus,
  handleVerifyPasskeySetupPassword,
} from "./passkey/status";

export {
  handleSetupPasskeyUnlock,
  handleSetupPasskeyUnlockWithPassword,
} from "./passkey/setup";

export { handleUnlockWithPasskey } from "./passkey/hydration";
export { handleRemovePasskeyUnlock } from "./passkey/removal";
