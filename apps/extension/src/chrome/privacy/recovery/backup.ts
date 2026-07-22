export const PRIVACY_RECOVERY_BACKUP_STORAGE_KEY = "privacyRecoveryBackup";

export interface PrivacyRecoveryBackupRecordV1 {
  version: 1;
  keyId: string;
  verifiedAt: number;
}

export interface PrivacyRecoveryBackupRecordV2 {
  version: 2;
  keyId: string;
  revision: number;
  verifiedAt: number;
}

export type PrivacyRecoveryBackupRecord =
  | PrivacyRecoveryBackupRecordV1
  | PrivacyRecoveryBackupRecordV2;

function valid(value: unknown): value is PrivacyRecoveryBackupRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const baseValid =
    typeof record.keyId === "string" &&
    record.keyId.length > 0 && record.keyId.length <= 128 &&
    typeof record.verifiedAt === "number" &&
    Number.isSafeInteger(record.verifiedAt) && record.verifiedAt > 0;
  if (!baseValid) return false;
  if (record.version === 1) return Object.keys(value).length === 3;
  return record.version === 2 && Object.keys(value).length === 4 &&
    typeof record.revision === "number" &&
    Number.isSafeInteger(record.revision) && record.revision >= 0;
}

export async function readPrivacyRecoveryBackup(
  expectedKeyId?: string,
  expectedRevision?: number,
): Promise<PrivacyRecoveryBackupRecord | null> {
  const stored = await chrome.storage.local.get(PRIVACY_RECOVERY_BACKUP_STORAGE_KEY);
  const record = stored[PRIVACY_RECOVERY_BACKUP_STORAGE_KEY];
  if (
    !valid(record) ||
    (expectedKeyId && record.keyId !== expectedKeyId) ||
    (expectedRevision !== undefined &&
      (record.version !== 2 || record.revision !== expectedRevision))
  ) return null;
  return record;
}

/** Record an explicit reveal/restore without ever persisting the phrase itself. */
export async function markPrivacyRecoveryBackedUp(
  keyId: string,
  revision: number,
): Promise<void> {
  const current = await readPrivacyRecoveryBackup(keyId, revision);
  if (current) return;
  const record: PrivacyRecoveryBackupRecordV2 = {
    version: 2,
    keyId,
    revision,
    verifiedAt: Date.now(),
  };
  await chrome.storage.local.set({
    [PRIVACY_RECOVERY_BACKUP_STORAGE_KEY]: record,
  });
}
