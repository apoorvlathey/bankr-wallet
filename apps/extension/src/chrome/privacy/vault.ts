import {
  encryptVaultKey,
  generateVaultKey,
  importVaultKey,
  tryDecryptVaultKey,
} from "../crypto";
import {
  createPrivacyKeyCheck,
  decryptPrivacyRecovery,
  unwrapPrivacyKeyFromPasskey,
  verifyPrivacyKeyCheck,
  wrapPrivacyKeyForPasskey,
} from "./crypto";
import { PRIVACY_DERIVATION_V1, PRIVACY_KEY_BYTES } from "./record";
import { readPrivacyVault } from "./repository";
import type {
  PrivacyVaultRecordV1,
  UnlockedPrivacyKey,
} from "./types";

async function verifyUnlockedPrivacyKey(
  record: PrivacyVaultRecordV1,
  key: CryptoKey,
): Promise<boolean> {
  if (!(await verifyPrivacyKeyCheck(key, record.keyId, record.keyCheck))) {
    return false;
  }
  return (
    record.recovery === null ||
    (await decryptPrivacyRecovery(key, record.keyId, record.recovery)) !== null
  );
}

async function importVerifiedPrivacyKey(
  record: PrivacyVaultRecordV1,
  keyBytes: Uint8Array,
): Promise<UnlockedPrivacyKey | null> {
  try {
    const key = await importVaultKey(keyBytes);
    return (await verifyUnlockedPrivacyKey(record, key))
      ? { key, keyBytes, keyId: record.keyId }
      : null;
  } catch {
    return null;
  }
}

async function recoverPrivacyKeyForMasterMutation(
  record: PrivacyVaultRecordV1,
  masterPassword: string,
  activePrivacyKey?: UnlockedPrivacyKey | null,
): Promise<Uint8Array | null> {
  if (record.masterWrappedKey) {
    return tryDecryptVaultKey(record.masterWrappedKey, masterPassword);
  }
  if (
    !activePrivacyKey ||
    activePrivacyKey.keyId !== record.keyId ||
    activePrivacyKey.keyBytes.byteLength !== PRIVACY_KEY_BYTES ||
    !(await verifyUnlockedPrivacyKey(record, activePrivacyKey.key))
  ) {
    return null;
  }
  return new Uint8Array(activePrivacyKey.keyBytes);
}

export async function unlockPrivacyVaultWithPassword(
  password: string,
): Promise<UnlockedPrivacyKey | null> {
  const stored = await readPrivacyVault();
  if (stored.status !== "valid") return null;
  const keyBytes = await tryDecryptVaultKey(
    stored.record.masterWrappedKey,
    password,
  );
  if (!keyBytes) return null;
  const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
  if (!unlocked) keyBytes.fill(0);
  return unlocked;
}

export async function unlockPrivacyVaultWithPasskey(
  prfKeyMaterial: string,
): Promise<UnlockedPrivacyKey | null> {
  const stored = await readPrivacyVault();
  if (
    stored.status !== "valid" ||
    !stored.record.passkeyWrappedKey
  ) {
    return null;
  }
  const keyBytes = await unwrapPrivacyKeyFromPasskey(
    stored.record.passkeyWrappedKey,
    stored.record.keyId,
    prfKeyMaterial,
  );
  if (!keyBytes) return null;
  const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
  if (!unlocked) keyBytes.fill(0);
  return unlocked;
}

export async function preparePrivacyVaultForPasskeyUnlock(
  prfKeyMaterial: string,
): Promise<{
  recordToCommit: PrivacyVaultRecordV1 | null;
  unlocked: UnlockedPrivacyKey;
} | null> {
  const stored = await readPrivacyVault();
  if (stored.status === "invalid") return null;

  if (stored.status === "valid") {
    if (!stored.record.passkeyWrappedKey) return null;
    const keyBytes = await unwrapPrivacyKeyFromPasskey(
      stored.record.passkeyWrappedKey,
      stored.record.keyId,
      prfKeyMaterial,
    );
    if (!keyBytes) return null;
    const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
    if (!unlocked) keyBytes.fill(0);
    return unlocked ? { recordToCommit: null, unlocked } : null;
  }

  const keyBytes = generateVaultKey();
  try {
    const key = await importVaultKey(keyBytes);
    const keyId = crypto.randomUUID();
    const [passkeyWrappedKey, keyCheck] = await Promise.all([
      wrapPrivacyKeyForPasskey(keyBytes, keyId, prfKeyMaterial),
      createPrivacyKeyCheck(key, keyId),
    ]);
    if (!passkeyWrappedKey) {
      keyBytes.fill(0);
      return null;
    }
    const record: PrivacyVaultRecordV1 = {
      version: 1,
      keyId,
      revision: 0,
      createdAt: Date.now(),
      derivation: PRIVACY_DERIVATION_V1,
      passkeyWrappedKey,
      keyCheck,
      recovery: null,
    };
    return {
      recordToCommit: record,
      unlocked: { key, keyBytes, keyId },
    };
  } catch {
    keyBytes.fill(0);
    return null;
  }
}

export async function preparePrivacyVaultForPasskeySetup(
  masterPassword: string,
  prfKeyMaterial: string,
  activePrivacyKey?: UnlockedPrivacyKey | null,
): Promise<{
  record: PrivacyVaultRecordV1;
  unlocked: UnlockedPrivacyKey;
} | null> {
  const stored = await readPrivacyVault();
  if (stored.status === "invalid") return null;

  if (stored.status === "missing") {
    const keyBytes = generateVaultKey();
    try {
      const key = await importVaultKey(keyBytes);
      const keyId = crypto.randomUUID();
      const [masterWrappedKey, passkeyWrappedKey, keyCheck] =
        await Promise.all([
          encryptVaultKey(keyBytes, masterPassword),
          wrapPrivacyKeyForPasskey(keyBytes, keyId, prfKeyMaterial),
          createPrivacyKeyCheck(key, keyId),
        ]);
      if (!passkeyWrappedKey) {
        keyBytes.fill(0);
        return null;
      }
      return {
        record: {
          version: 1,
          keyId,
          revision: 0,
          createdAt: Date.now(),
          derivation: PRIVACY_DERIVATION_V1,
          masterWrappedKey,
          passkeyWrappedKey,
          keyCheck,
          recovery: null,
        },
        unlocked: { key, keyBytes, keyId },
      };
    } catch {
      keyBytes.fill(0);
      return null;
    }
  }

  const keyBytes = stored.record.masterWrappedKey
    ? await tryDecryptVaultKey(
        stored.record.masterWrappedKey,
        masterPassword,
      )
    : (await recoverPrivacyKeyForMasterMutation(
        stored.record,
        masterPassword,
        activePrivacyKey,
      )) ??
      (stored.record.passkeyWrappedKey
        ? await unwrapPrivacyKeyFromPasskey(
            stored.record.passkeyWrappedKey,
            stored.record.keyId,
            prfKeyMaterial,
          )
        : null);
  if (!keyBytes) return null;
  const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
  if (!unlocked) {
    keyBytes.fill(0);
    return null;
  }
  try {
    const [masterWrappedKey, passkeyWrappedKey] = await Promise.all([
      encryptVaultKey(keyBytes, masterPassword),
      wrapPrivacyKeyForPasskey(
        keyBytes,
        stored.record.keyId,
        prfKeyMaterial,
      ),
    ]);
    if (!passkeyWrappedKey) {
      keyBytes.fill(0);
      return null;
    }
    return {
      record: {
        ...stored.record,
        revision: stored.record.revision + 1,
        masterWrappedKey,
        passkeyWrappedKey,
      },
      unlocked,
    };
  } catch {
    keyBytes.fill(0);
    return null;
  }
}

export async function preparePrivacyVaultForPasswordRotation(
  currentPassword: string,
  newPassword: string,
  activePrivacyKey?: UnlockedPrivacyKey | null,
): Promise<PrivacyVaultRecordV1 | null | false> {
  const stored = await readPrivacyVault();
  if (stored.status === "missing") return null;
  if (stored.status === "invalid") return false;
  const keyBytes = await recoverPrivacyKeyForMasterMutation(
    stored.record,
    currentPassword,
    activePrivacyKey,
  );
  if (!keyBytes) return false;
  try {
    const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
    if (!unlocked) return false;
    const masterWrappedKey = await encryptVaultKey(keyBytes, newPassword);
    const withoutPasskey = { ...stored.record };
    delete withoutPasskey.passkeyWrappedKey;
    return {
      ...withoutPasskey,
      revision: stored.record.revision + 1,
      masterWrappedKey,
    };
  } finally {
    keyBytes.fill(0);
  }
}

export async function preparePrivacyVaultForPasskeyRemoval(
  masterPassword: string,
  activePrivacyKey?: UnlockedPrivacyKey | null,
): Promise<PrivacyVaultRecordV1 | null | false> {
  const stored = await readPrivacyVault();
  if (stored.status === "missing") return null;
  if (stored.status === "invalid") return false;
  const keyBytes = await recoverPrivacyKeyForMasterMutation(
    stored.record,
    masterPassword,
    activePrivacyKey,
  );
  if (!keyBytes) return false;
  try {
    const unlocked = await importVerifiedPrivacyKey(stored.record, keyBytes);
    if (!unlocked) return false;
    const masterWrappedKey =
      stored.record.masterWrappedKey ??
      (await encryptVaultKey(keyBytes, masterPassword));
    const withoutPasskey = { ...stored.record };
    delete withoutPasskey.passkeyWrappedKey;
    return {
      ...withoutPasskey,
      revision: stored.record.revision + 1,
      masterWrappedKey,
    };
  } finally {
    keyBytes.fill(0);
  }
}

export async function verifyPrivacyVaultWithKey(
  record: PrivacyVaultRecordV1,
  key: CryptoKey,
): Promise<boolean> {
  return verifyUnlockedPrivacyKey(record, key);
}
