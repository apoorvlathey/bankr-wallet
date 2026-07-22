import {
  isValidPrivacyVaultRecord,
  PRIVACY_VAULT_STORAGE_KEY,
} from "./record";
import type { PrivacyVaultRecordV1 } from "./types";

export type PrivacyVaultReadResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; record: PrivacyVaultRecordV1 };

export async function readPrivacyVault(): Promise<PrivacyVaultReadResult> {
  const stored = await chrome.storage.local.get(PRIVACY_VAULT_STORAGE_KEY);
  const value = stored[PRIVACY_VAULT_STORAGE_KEY];
  if (value === undefined || value === null) return { status: "missing" };
  return isValidPrivacyVaultRecord(value)
    ? { status: "valid", record: value }
    : { status: "invalid" };
}

export async function savePrivacyVault(
  record: PrivacyVaultRecordV1,
): Promise<void> {
  if (!isValidPrivacyVaultRecord(record)) {
    throw new Error("Invalid privacy vault record");
  }
  await chrome.storage.local.set({ [PRIVACY_VAULT_STORAGE_KEY]: record });
}
