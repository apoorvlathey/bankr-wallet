export const PRIVACY_RECOVERY_BACKUP_STORAGE_KEY = "privacyRecoveryBackup";

export interface PrivacyRecoveryBackupRecordV1 {
  version: 1;
  keyId: string;
  verifiedAt: number;
}

function valid(value: unknown): value is PrivacyRecoveryBackupRecordV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Partial<PrivacyRecoveryBackupRecordV1>;
  return Object.keys(value).length === 3 &&
    record.version === 1 &&
    typeof record.keyId === "string" &&
    record.keyId.length > 0 && record.keyId.length <= 128 &&
    typeof record.verifiedAt === "number" &&
    Number.isSafeInteger(record.verifiedAt) && record.verifiedAt > 0;
}

export async function readPrivacyRecoveryBackup(
  expectedKeyId?: string,
): Promise<PrivacyRecoveryBackupRecordV1 | null> {
  const stored = await chrome.storage.local.get(PRIVACY_RECOVERY_BACKUP_STORAGE_KEY);
  const record = stored[PRIVACY_RECOVERY_BACKUP_STORAGE_KEY];
  if (!valid(record) || (expectedKeyId && record.keyId !== expectedKeyId)) return null;
  return record;
}

/** Record an explicit reveal/restore without ever persisting the phrase itself. */
export async function markPrivacyRecoveryBackedUp(keyId: string): Promise<void> {
  const current = await readPrivacyRecoveryBackup(keyId);
  if (current) return;
  const record: PrivacyRecoveryBackupRecordV1 = {
    version: 1,
    keyId,
    verifiedAt: Date.now(),
  };
  await chrome.storage.local.set({
    [PRIVACY_RECOVERY_BACKUP_STORAGE_KEY]: record,
  });
}
