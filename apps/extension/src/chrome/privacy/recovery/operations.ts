import { getActiveAccount } from "../../accountStorage";
import { verifyMasterPassword } from "../../authHandlers";
import { getAuthCeremonyEpoch } from "../../authTransition";
import { isBoundedExistingPassword } from "../../../constants/securityPolicy";
import {
  assertCurrentMasterAuthorization,
} from "../../masterAuthorization";
import {
  encryptVaultKey,
  generateVaultKey,
  importVaultKey,
} from "../../crypto";
import {
  getCachedPrivacyKey,
  getPasswordType,
  isWalletUnlocked,
  setCachedPrivacyKey,
} from "../../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  createPrivacyKeyCheck,
  decryptPrivacyRecovery,
  encryptPrivacyRecovery,
  isValidPrivacyRecoveryPhrase,
} from "../crypto";
import { deletePrivacyCommitmentsDatabase } from "../commitments/repository";
import { deletePrivacyOperationsDatabase } from "../operations/repository";
import { deletePrivacyRagequitsDatabase } from "../ragequit/repository";
import { PRIVACY_DERIVATION_V1 } from "../record";
import { readPrivacyVault, savePrivacyVault } from "../repository";
import { deletePrivacyWithdrawalsDatabase } from "../withdrawals/repository";
import { deletePrivacyPortfolioDatabase } from "../portfolioHistory/repository";
import type {
  PrivacyVaultRecordV1,
  UnlockedPrivacyKey,
} from "../types";
import {
  unlockPrivacyVaultWithPassword,
  verifyPrivacyVaultWithKey,
} from "../vault";
import {
  markPrivacyRecoveryBackedUp,
  readPrivacyRecoveryBackup,
} from "./backup";
import { addPrivacyKeyToSessionCapability } from "../../session/capabilityPersistence";

async function cachePrivacySessionKey(unlocked: UnlockedPrivacyKey): Promise<void> {
  setCachedPrivacyKey(unlocked);
  await addPrivacyKeyToSessionCapability({
    keyBytes: unlocked.keyBytes,
    keyId: unlocked.keyId,
  }).catch((error) => {
    console.warn("[privacy] Failed to refresh the live session capability:", error);
  });
}

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrivacyRecoveryStatus =
  | {
      success: true;
      status: "missing" | "ready";
      hasMasterRecovery: boolean;
      backupVerified: boolean;
    }
  | {
      success: false;
      status: "attention";
      error: string;
    };

export type PrivacyRecoveryErrorCode =
  | "invalid-request"
  | "auth-required"
  | "account-unavailable"
  | "recovery-missing"
  | "replacement-confirmation-required"
  | "recovery-unavailable";

export class PrivacyRecoveryError extends Error {
  constructor(readonly code: PrivacyRecoveryErrorCode) {
    super(code);
    this.name = "PrivacyRecoveryError";
  }
}

type Dependencies = {
  getActiveAccount: typeof getActiveAccount;
  verifyMasterPassword: typeof verifyMasterPassword;
  deletePrivacyCommitmentsDatabase: typeof deletePrivacyCommitmentsDatabase;
  deletePrivacyOperationsDatabase: typeof deletePrivacyOperationsDatabase;
  deletePrivacyRagequitsDatabase: typeof deletePrivacyRagequitsDatabase;
  deletePrivacyWithdrawalsDatabase: typeof deletePrivacyWithdrawalsDatabase;
  deletePrivacyPortfolioDatabase: typeof deletePrivacyPortfolioDatabase;
};

const productionDependencies: Dependencies = {
  getActiveAccount,
  verifyMasterPassword,
  deletePrivacyCommitmentsDatabase,
  deletePrivacyOperationsDatabase,
  deletePrivacyRagequitsDatabase,
  deletePrivacyWithdrawalsDatabase,
  deletePrivacyPortfolioDatabase,
};

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function requireExplicitMaster(
  password: string,
  dependencies: Dependencies,
): Promise<string> {
  if (
    !isBoundedExistingPassword(password) ||
    !isWalletUnlocked() ||
    getPasswordType() !== "master"
  ) {
    throw new PrivacyRecoveryError("auth-required");
  }
  const account = await dependencies.getActiveAccount();
  if (!account || account.type === "impersonator") {
    throw new PrivacyRecoveryError("account-unavailable");
  }
  const expectedEpoch = getAuthCeremonyEpoch();
  if (!(await dependencies.verifyMasterPassword(password))) {
    throw new PrivacyRecoveryError("auth-required");
  }
  try {
    assertCurrentMasterAuthorization(expectedEpoch);
  } catch {
    throw new PrivacyRecoveryError("auth-required");
  }
  return expectedEpoch;
}

async function resolveRecordKey(
  record: PrivacyVaultRecordV1,
  password: string,
): Promise<{ unlocked: UnlockedPrivacyKey; ownsBytes: boolean }> {
  if (record.masterWrappedKey) {
    const unlocked = await unlockPrivacyVaultWithPassword(password);
    if (!unlocked || unlocked.keyId !== record.keyId) {
      unlocked?.keyBytes.fill(0);
      throw new PrivacyRecoveryError("recovery-unavailable");
    }
    return { unlocked, ownsBytes: true };
  }

  const cached = getCachedPrivacyKey();
  if (
    !cached ||
    cached.keyId !== record.keyId ||
    !(await verifyPrivacyVaultWithKey(record, cached.key))
  ) {
    throw new PrivacyRecoveryError("recovery-unavailable");
  }
  return { unlocked: cached, ownsBytes: false };
}

async function ensureMasterWrapper(
  record: PrivacyVaultRecordV1,
  unlocked: UnlockedPrivacyKey,
  password: string,
  expectedEpoch: string,
): Promise<PrivacyVaultRecordV1> {
  if (record.masterWrappedKey) return record;
  const next: PrivacyVaultRecordV1 = {
    ...record,
    revision: record.revision + 1,
    masterWrappedKey: await encryptVaultKey(unlocked.keyBytes, password),
  };
  try {
    assertCurrentMasterAuthorization(expectedEpoch);
  } catch {
    throw new PrivacyRecoveryError("auth-required");
  }
  await savePrivacyVault(next);
  return next;
}

export async function readPrivacyRecoveryStatus(): Promise<PrivacyRecoveryStatus> {
  const stored = await readPrivacyVault();
  if (stored.status === "invalid") {
    return {
      success: false,
      status: "attention",
      error: "Shield recovery needs attention.",
    };
  }
  if (stored.status === "missing" || stored.record.recovery === null) {
    return {
      success: true,
      status: "missing",
      hasMasterRecovery: stored.status === "valid" &&
        !!stored.record.masterWrappedKey,
      backupVerified: false,
    };
  }
  return {
    success: true,
    status: "ready",
    hasMasterRecovery: !!stored.record.masterWrappedKey,
    backupVerified: await readPrivacyRecoveryBackup(stored.record.keyId) !== null,
  };
}

/** Reveal only to the dedicated Settings recovery surface after fresh password proof. */
export async function revealPrivacyRecovery(
  password: string,
  overrides: Partial<Dependencies> = {},
): Promise<{ phrase: string; hasMasterRecovery: true }> {
  const dependencies = { ...productionDependencies, ...overrides };
  const expectedEpoch = await requireExplicitMaster(password, dependencies);

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      assertCurrentMasterAuthorization(expectedEpoch);
    } catch {
      throw new PrivacyRecoveryError("auth-required");
    }
    const stored = await readPrivacyVault();
    if (stored.status === "missing") {
      throw new PrivacyRecoveryError("recovery-missing");
    }
    if (stored.status !== "valid") {
      throw new PrivacyRecoveryError("recovery-unavailable");
    }
    if (stored.record.recovery === null) {
      throw new PrivacyRecoveryError("recovery-missing");
    }

    const resolved = await resolveRecordKey(stored.record, password);
    try {
      const current = await ensureMasterWrapper(
        stored.record,
        resolved.unlocked,
        password,
        expectedEpoch,
      );
      const phrase = await decryptPrivacyRecovery(
        resolved.unlocked.key,
        current.keyId,
        current.recovery!,
      );
      try {
        assertCurrentMasterAuthorization(expectedEpoch);
      } catch {
        throw new PrivacyRecoveryError("auth-required");
      }
      if (!phrase) throw new PrivacyRecoveryError("recovery-unavailable");
      await markPrivacyRecoveryBackedUp(current.keyId, current.revision);
      return { phrase, hasMasterRecovery: true };
    } finally {
      if (resolved.ownsBytes) resolved.unlocked.keyBytes.fill(0);
    }
  });
}

async function createRestoredRecord(
  phrase: string,
  password: string,
): Promise<{ record: PrivacyVaultRecordV1; unlocked: UnlockedPrivacyKey }> {
  const keyBytes = generateVaultKey();
  try {
    const key = await importVaultKey(keyBytes);
    const keyId = crypto.randomUUID();
    const [masterWrappedKey, keyCheck, recovery] = await Promise.all([
      encryptVaultKey(keyBytes, password),
      createPrivacyKeyCheck(key, keyId),
      encryptPrivacyRecovery(key, keyId, phrase),
    ]);
    return {
      record: {
        version: 1,
        keyId,
        revision: 1,
        createdAt: Date.now(),
        derivation: PRIVACY_DERIVATION_V1,
        masterWrappedKey,
        keyCheck,
        recovery,
      },
      unlocked: { key, keyBytes, keyId },
    };
  } catch (error) {
    keyBytes.fill(0);
    throw error;
  }
}

/** Import one WalletChan privacy phrase without replacing a different identity. */
export async function restorePrivacyRecovery(
  request: {
    requestId: string;
    phrase: string;
    password: string;
    replaceExisting: boolean;
    backupConfirmed: boolean;
    lossConfirmed: boolean;
  },
  overrides: Partial<Dependencies> = {},
): Promise<{ status: "restored" | "already-current" }> {
  const phrase = normalizePhrase(request.phrase);
  if (!REQUEST_ID.test(request.requestId) || !isValidPrivacyRecoveryPhrase(phrase)) {
    throw new PrivacyRecoveryError("invalid-request");
  }
  const dependencies = { ...productionDependencies, ...overrides };
  const expectedEpoch = await requireExplicitMaster(
    request.password,
    dependencies,
  );

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      assertCurrentMasterAuthorization(expectedEpoch);
    } catch {
      throw new PrivacyRecoveryError("auth-required");
    }
    const stored = await readPrivacyVault();
    if (stored.status === "invalid") {
      throw new PrivacyRecoveryError("recovery-unavailable");
    }

    if (stored.status === "missing") {
      const created = await createRestoredRecord(phrase, request.password);
      try {
        assertCurrentMasterAuthorization(expectedEpoch);
        await savePrivacyVault(created.record);
        await markPrivacyRecoveryBackedUp(
          created.record.keyId,
          created.record.revision,
        );
        await cachePrivacySessionKey(created.unlocked);
        return { status: "restored" };
      } finally {
        created.unlocked.keyBytes.fill(0);
      }
    }

    const resolved = await resolveRecordKey(stored.record, request.password);
    try {
      if (stored.record.recovery !== null) {
        const currentPhrase = await decryptPrivacyRecovery(
          resolved.unlocked.key,
          stored.record.keyId,
          stored.record.recovery,
        );
        if (!currentPhrase) {
          throw new PrivacyRecoveryError("recovery-unavailable");
        }
        if (currentPhrase !== phrase) {
          if (
            !request.replaceExisting ||
            !request.backupConfirmed ||
            !request.lossConfirmed ||
            !(await readPrivacyRecoveryBackup(
              stored.record.keyId,
              stored.record.revision,
            ))
          ) {
            throw new PrivacyRecoveryError("replacement-confirmation-required");
          }

          const next: PrivacyVaultRecordV1 = {
            ...stored.record,
            revision: stored.record.revision + 1,
            recovery: await encryptPrivacyRecovery(
              resolved.unlocked.key,
              stored.record.keyId,
              phrase,
            ),
          };
          assertCurrentMasterAuthorization(expectedEpoch);
          await savePrivacyVault(next);
          try {
            await dependencies.deletePrivacyOperationsDatabase();
            await dependencies.deletePrivacyCommitmentsDatabase();
            await dependencies.deletePrivacyWithdrawalsDatabase();
            await dependencies.deletePrivacyRagequitsDatabase();
            await dependencies.deletePrivacyPortfolioDatabase();
            assertCurrentMasterAuthorization(expectedEpoch);
            await markPrivacyRecoveryBackedUp(next.keyId, next.revision);
          } catch {
            // The old phrase remains authoritative if rebuildable-state cleanup
            // cannot complete. Deleted indexes can be reconstructed by rescan.
            await savePrivacyVault(stored.record);
            throw new PrivacyRecoveryError("recovery-unavailable");
          }
          await cachePrivacySessionKey(resolved.unlocked);
          return { status: "restored" };
        }
        const current = await ensureMasterWrapper(
          stored.record,
          resolved.unlocked,
          request.password,
          expectedEpoch,
        );
        await markPrivacyRecoveryBackedUp(
          current.keyId,
          current.revision,
        );
        await cachePrivacySessionKey(resolved.unlocked);
        return { status: "already-current" };
      }

      const recovery = await encryptPrivacyRecovery(
        resolved.unlocked.key,
        stored.record.keyId,
        phrase,
      );
      const masterWrappedKey = stored.record.masterWrappedKey ??
        await encryptVaultKey(resolved.unlocked.keyBytes, request.password);
      const next: PrivacyVaultRecordV1 = {
        ...stored.record,
        revision: stored.record.revision + 1,
        masterWrappedKey,
        recovery,
      };
      assertCurrentMasterAuthorization(expectedEpoch);
      await savePrivacyVault(next);
      await markPrivacyRecoveryBackedUp(next.keyId, next.revision);
      await cachePrivacySessionKey(resolved.unlocked);
      return { status: "restored" };
    } finally {
      if (resolved.ownsBytes) resolved.unlocked.keyBytes.fill(0);
    }
  });
}
