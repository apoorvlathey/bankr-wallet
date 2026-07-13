import { getAccounts } from "../accountStorage";
import {
  decrypt,
  decryptWithVaultKey,
  type EncryptedData,
  encryptWithVaultKey,
  importVaultKey,
} from "../crypto";
import { migratePrivateKeysToVaultKey } from "./legacyVaultKeyMigration";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { retainValidLocalAccountKeys } from "../vault/accountIntegrity";
import {
  getAutoLockTimeout,
  getCachedPassword,
  setCachedApiKey,
  setCachedMnemonicKey,
  setCachedPasswordDirect,
  setCachedPasswordType,
  setCachedVault,
  setCachedVaultKey,
  setCurrentSessionId,
  storeSessionAtomic,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type { DecryptedEntry, PasswordType } from "../types";
import {
  hasVaultEntries,
  isVaultKeyEncrypted,
  loadVault,
} from "../vaultCrypto";

export interface HydrateAuthSessionOptions {
  password?: string | null;
  persistPasswordSession?: boolean;
  migrateLegacyPrivateKeys?: boolean;
  mnemonicKey?: { key: CryptoKey; keyId: string } | null;
  // Current-session biometric setup must not refresh a passively expired
  // master session while it performs migration/decryption work.
  expectedMasterAuthEpoch?: string;
  // Onboarding creates and hydrates the initial credential while already
  // holding WALLET_SECRET_OPERATION_LOCK_KEY. Keep the legacy-credential
  // migration re-entrant-safe for that caller even though a fresh onboarding
  // wallet should never have legacy ciphertext.
  secretOperationAlreadySerialized?: boolean;
}

async function loadApiKeyForVaultSession(
  vaultKey: CryptoKey,
  passwordType: PasswordType,
  options: HydrateAuthSessionOptions,
): Promise<
  { success: true; apiKey: string | null } |
  { success: false; error: string }
> {
  const readCredential = async (): Promise<
    { success: true; apiKey: string | null } |
    { success: false; error: string }
  > => {
    const { encryptedApiKeyVault, encryptedApiKey } =
      await chrome.storage.local.get([
        "encryptedApiKeyVault",
        "encryptedApiKey",
      ]);

    if (encryptedApiKeyVault) {
      const apiKey = await decryptWithVaultKey(vaultKey, encryptedApiKeyVault);
      if (!apiKey) {
        return { success: false, error: "Failed to decrypt API key" };
      }
      return { success: true, apiKey };
    }

    if (!encryptedApiKey) {
      return { success: true, apiKey: null };
    }

    // A passkey or agent can unwrap only the general vault key. It cannot
    // authenticate/decrypt a credential that an older release left tied to
    // the master password, so never report a half-unlocked Bankr-only wallet.
    if (passwordType !== "master" || !options.password) {
      return {
        success: false,
        error:
          "Unlock with the master password once to migrate the legacy Bankr credential",
      };
    }

    let legacyApiKey: string;
    try {
      legacyApiKey = await decrypt(
        encryptedApiKey as EncryptedData,
        options.password,
      );
    } catch {
      return { success: false, error: "Failed to decrypt API key" };
    }
    if (!legacyApiKey) {
      return { success: false, error: "Failed to decrypt API key" };
    }

    const migrated = await encryptWithVaultKey(vaultKey, legacyApiKey);
    try {
      // One atomic local-storage update publishes the replacement before the
      // legacy password ciphertext is dropped. If this best-effort migration
      // cannot be persisted, the explicitly authenticated master session can
      // still use the recovered credential and will retry next unlock.
      if (options.expectedMasterAuthEpoch) {
        assertCurrentMasterAuthorization(options.expectedMasterAuthEpoch);
      }
      await chrome.storage.local.set({
        encryptedApiKeyVault: migrated,
        encryptedApiKey: null,
      });
    } catch (error) {
      console.warn(
        "[authHandlers] Legacy Bankr credential migration was deferred:",
        error,
      );
    }
    return { success: true, apiKey: legacyApiKey };
  };

  // Re-read under the shared operation lock so a concurrent Bankr credential
  // update wins by order instead of being overwritten by a stale migration.
  return options.secretOperationAlreadySerialized
    ? readCredential()
    : withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, readCredential);
}

/** Hydrates one complete unlocked cache generation from raw vault-key bytes. */
async function hydrateAuthSessionFromVaultKeyBytesWithinSecretOperation(
  vaultKeyBytes: Uint8Array,
  passwordType: PasswordType,
  options: HydrateAuthSessionOptions = {},
): Promise<{ success: boolean; error?: string }> {
  if (options.expectedMasterAuthEpoch) {
    assertCurrentMasterAuthorization(options.expectedMasterAuthEpoch);
  }
  await getAutoLockTimeout();

  let vaultKey: CryptoKey;
  try {
    vaultKey = await importVaultKey(vaultKeyBytes);
  } catch {
    return { success: false, error: "Failed to import vault key" };
  }

  const apiKeyResult = await loadApiKeyForVaultSession(
    vaultKey,
    passwordType,
    options,
  );
  if (!apiKeyResult.success) return apiKeyResult;
  const apiKey = apiKeyResult.apiKey;

  let decryptedVault: DecryptedEntry[] | null = null;
  const hasVault = await hasVaultEntries();
  if (hasVault) {
    if (options.migrateLegacyPrivateKeys && options.password) {
      const vault = await loadVault();
      const needsMigration = vault?.entries.some(
        (entry) => !isVaultKeyEncrypted(entry.keystore),
      );

      if (needsMigration) {
        await migratePrivateKeysToVaultKey(
          options.password,
          vaultKey,
          true,
          options.expectedMasterAuthEpoch,
        );
      }
    }

    decryptedVault = await decryptAllKeysWithVaultKey(
      vaultKey,
      options.password ?? null,
    );
    if (!decryptedVault && passwordType === "agent") {
      // SECURITY (H-5): Agent unlock cannot decrypt password-encrypted
      // legacy keystores. Surface a clear error rather than a partial session.
      const fullVault = await loadVault();
      const hasLegacyEntries = fullVault?.entries.some(
        (entry) => !isVaultKeyEncrypted(entry.keystore),
      );
      if (hasLegacyEntries) {
        return {
          success: false,
          error:
            "Unlock with master password once to migrate legacy private keys",
        };
      }
    } else if (!decryptedVault) {
      return { success: false, error: "Failed to decrypt vault" };
    }
  }

  let persistedSessionId: string | null = null;
  if (options.persistPasswordSession && options.password) {
    if (options.expectedMasterAuthEpoch) {
      assertCurrentMasterAuthorization(options.expectedMasterAuthEpoch);
    }
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      persistedSessionId = crypto.randomUUID();
      // Persist before committing in-memory credentials. If either storage
      // write fails, callers receive an error while the cache stays unchanged.
      await storeSessionAtomic(
        persistedSessionId,
        true,
        passwordType,
        options.password,
      );
    }
  }

  // Commit the prepared session synchronously only after every fallible step.
  if (options.expectedMasterAuthEpoch) {
    assertCurrentMasterAuthorization(options.expectedMasterAuthEpoch);
  }
  setCachedVaultKey(vaultKey);
  setCachedMnemonicKey(
    passwordType === "master" ? options.mnemonicKey ?? null : null,
  );
  setCachedPasswordType(passwordType);
  setCachedPasswordDirect(options.password ?? null);
  if (persistedSessionId) setCurrentSessionId(persistedSessionId);

  if (apiKey) {
    setCachedApiKey(apiKey);
  }
  if (decryptedVault) {
    setCachedVault(decryptedVault);
  }

  return { success: true };
}

/**
 * Prepares and commits one complete authentication cache generation while the
 * account/secret operation lock is held.
 */
export function hydrateAuthSessionFromVaultKeyBytes(
  vaultKeyBytes: Uint8Array,
  passwordType: PasswordType,
  options: HydrateAuthSessionOptions = {},
): Promise<{ success: boolean; error?: string }> {
  if (options.secretOperationAlreadySerialized) {
    return hydrateAuthSessionFromVaultKeyBytesWithinSecretOperation(
      vaultKeyBytes,
      passwordType,
      options,
    );
  }
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, () =>
    hydrateAuthSessionFromVaultKeyBytesWithinSecretOperation(
      vaultKeyBytes,
      passwordType,
      { ...options, secretOperationAlreadySerialized: true },
    ),
  );
}

/** Decrypt every private key with modern and legacy compatibility. */
export async function decryptAllKeysWithVaultKey(
  vaultKey: CryptoKey,
  fallbackPassword?: string | null,
): Promise<DecryptedEntry[] | null> {
  const {
    loadVault,
    isVaultKeyEncrypted,
    decryptPrivateKeyWithVaultKey,
    decryptPrivateKey,
  } = await import("../vaultCrypto");

  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return [];
  }

  try {
    const decrypted: DecryptedEntry[] = [];
    for (const entry of vault.entries) {
      const keystore = entry.keystore;

      if (isVaultKeyEncrypted(keystore)) {
        const privateKey = await decryptPrivateKeyWithVaultKey(
          keystore,
          vaultKey,
        );
        if (!privateKey) throw new Error("Vault key decryption failed");
        decrypted.push({ id: entry.id, privateKey });
      } else {
        const password = fallbackPassword ?? getCachedPassword();
        if (!password) {
          throw new Error("Password required for legacy keystore format");
        }
        if (!isLegacyEncryptedKeystore(keystore)) {
          throw new Error("Invalid legacy keystore format");
        }
        const privateKey = await decryptPrivateKey(keystore, password);
        decrypted.push({ id: entry.id, privateKey });
      }
    }
    return retainValidLocalAccountKeys(decrypted, await getAccounts());
  } catch (error) {
    console.error("Failed to decrypt vault with vault key:", error);
    return null;
  }
}

interface LegacyEncryptedKeystore {
  ciphertext: string;
  iv: string;
  salt: string;
}

function isLegacyEncryptedKeystore(
  value: object,
): value is LegacyEncryptedKeystore {
  const candidate = value as Partial<LegacyEncryptedKeystore>;
  return (
    typeof candidate.ciphertext === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.salt === "string" &&
    candidate.salt.length > 0
  );
}
