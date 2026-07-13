import {
  isValidPasskeyUnlockRecord,
  type PasskeyUnlockRecord,
} from "./record";

export const PASSKEY_UNLOCK_STORAGE_KEY = "passkeyUnlock";

export async function loadPasskeyUnlockRecord(): Promise<PasskeyUnlockRecord | null> {
  const result = await chrome.storage.local.get(PASSKEY_UNLOCK_STORAGE_KEY);
  const record = result[PASSKEY_UNLOCK_STORAGE_KEY] as
    | PasskeyUnlockRecord
    | null
    | undefined;

  return isValidPasskeyUnlockRecord(record) ? record : null;
}

export async function savePasskeyRecord(
  record: PasskeyUnlockRecord,
): Promise<void> {
  await chrome.storage.local.set({ [PASSKEY_UNLOCK_STORAGE_KEY]: record });
}
