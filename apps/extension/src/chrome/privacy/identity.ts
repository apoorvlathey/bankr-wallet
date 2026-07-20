import { getActiveAccount } from "../accountStorage";
import { handleUnlockWallet } from "../authHandlers";
import {
  assertCurrentMasterAuthorization,
} from "../masterAuthorization";
import {
  getAuthCeremonyEpoch,
} from "../authTransition";
import {
  encryptVaultKey,
  generateVaultKey,
  importVaultKey,
} from "../crypto";
import {
  getCachedPassword,
  getCachedPrivacyKey,
  getPasswordType,
  isWalletUnlocked,
  setCachedPrivacyKey,
  tryRestoreSession,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  createPrivacyKeyCheck,
  encryptPrivacyRecovery,
  generatePrivacyRecoveryPhrase,
} from "./crypto";
import { PRIVACY_DERIVATION_V1 } from "./record";
import { readPrivacyVault, savePrivacyVault } from "./repository";
import type {
  PrivacyInitializationStatus,
  PrivacyVaultRecordV1,
} from "./types";
import {
  unlockPrivacyVaultWithPassword,
  verifyPrivacyVaultWithKey,
} from "./vault";

const MASTER_REQUIRED = "Use your main password to finish Shield setup.";
const CUSTODY_ACCOUNT_REQUIRED =
  "Switch to a wallet account that can hold funds to finish Shield setup.";
const RECOVERY_ATTENTION_REQUIRED =
  "Shield recovery needs attention before you continue.";

function actionRequired(error: string): PrivacyInitializationStatus {
  return { success: false, status: "action-required", error };
}

async function createEmptyPrivacyVault(
  masterPassword: string,
): Promise<{
  record: PrivacyVaultRecordV1;
  key: CryptoKey;
  keyBytes: Uint8Array;
}> {
  const keyBytes = generateVaultKey();
  try {
    const key = await importVaultKey(keyBytes);
    const keyId = crypto.randomUUID();
    const [masterWrappedKey, keyCheck] = await Promise.all([
      encryptVaultKey(keyBytes, masterPassword),
      createPrivacyKeyCheck(key, keyId),
    ]);
    return {
      record: {
        version: 1,
        keyId,
        revision: 0,
        createdAt: Date.now(),
        derivation: PRIVACY_DERIVATION_V1,
        masterWrappedKey,
        keyCheck,
        recovery: null,
      },
      key,
      keyBytes,
    };
  } catch (error) {
    keyBytes.fill(0);
    throw error;
  }
}

export async function ensurePrivacyIdentityInitialized(): Promise<PrivacyInitializationStatus> {
  if (!isWalletUnlocked()) {
    await tryRestoreSession(handleUnlockWallet);
  }
  if (!isWalletUnlocked()) return actionRequired(MASTER_REQUIRED);

  const expectedAuthEpoch = getAuthCeremonyEpoch();
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const stored = await readPrivacyVault();
    if (stored.status === "invalid") {
      return actionRequired(RECOVERY_ATTENTION_REQUIRED);
    }
    if (stored.status === "valid" && stored.record.recovery !== null) {
      return { success: true, status: "ready" };
    }

    const activeAccount = await getActiveAccount();
    if (!activeAccount || activeAccount.type === "impersonator") {
      return actionRequired(CUSTODY_ACCOUNT_REQUIRED);
    }
    if (getPasswordType() !== "master") {
      return actionRequired(MASTER_REQUIRED);
    }
    try {
      assertCurrentMasterAuthorization(expectedAuthEpoch);
    } catch {
      return actionRequired(MASTER_REQUIRED);
    }

    let record = stored.status === "valid" ? stored.record : null;
    let privacyKey = getCachedPrivacyKey();
    let createdKeyBytes: Uint8Array | null = null;
    if (!record) {
      const masterPassword = getCachedPassword();
      if (!masterPassword) return actionRequired(MASTER_REQUIRED);
      const created = await createEmptyPrivacyVault(masterPassword);
      record = created.record;
      privacyKey = {
        key: created.key,
        keyBytes: created.keyBytes,
        keyId: created.record.keyId,
      };
      createdKeyBytes = created.keyBytes;
    } else if (!privacyKey || privacyKey.keyId !== record.keyId) {
      const masterPassword = getCachedPassword();
      if (!masterPassword) return actionRequired(MASTER_REQUIRED);
      const unlocked = await unlockPrivacyVaultWithPassword(masterPassword);
      if (!unlocked) return actionRequired(RECOVERY_ATTENTION_REQUIRED);
      privacyKey = {
        key: unlocked.key,
        keyBytes: unlocked.keyBytes,
        keyId: unlocked.keyId,
      };
      createdKeyBytes = unlocked.keyBytes;
    }

    try {
      if (!(await verifyPrivacyVaultWithKey(record, privacyKey.key))) {
        return actionRequired(RECOVERY_ATTENTION_REQUIRED);
      }
      const recovery = await encryptPrivacyRecovery(
        privacyKey.key,
        record.keyId,
        generatePrivacyRecoveryPhrase(),
      );
      assertCurrentMasterAuthorization(expectedAuthEpoch);
      await savePrivacyVault({
        ...record,
        revision: record.revision + 1,
        recovery,
      });
      setCachedPrivacyKey(privacyKey);
      return { success: true, status: "ready" };
    } catch {
      return actionRequired(RECOVERY_ATTENTION_REQUIRED);
    } finally {
      createdKeyBytes?.fill(0);
    }
  });
}
