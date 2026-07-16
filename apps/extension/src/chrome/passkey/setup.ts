import { getAccounts } from "../accountStorage";
import {
  handleUnlockWallet,
  hydrateAuthSessionFromVaultKeyBytes,
} from "../authHandlers";
import {
  clearManualLockRestorationBlock,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "../authTransition";
import { encryptVaultKey, generateVaultKey, importVaultKey } from "../crypto";
import { deriveAddress } from "../localSigner";
import {
  assertCurrentMasterAuthorization,
  STALE_MASTER_AUTHORIZATION_ERROR,
} from "../masterAuthorization";
import {
  decryptMnemonicKeyVaultEntries,
  prepareMnemonicKeyVault,
  unlockMnemonicKeyWithPassword,
  withMnemonicVaultLock,
} from "../mnemonicStorage";
import {
  buildPasskeyRecord,
} from "./keyWrapping";
import {
  isValidPasskeyCredentialPayload,
  type PasskeyCredentialPayload,
} from "./record";
import { PASSKEY_UNLOCK_STORAGE_KEY } from "./repository";
import {
  getCurrentMasterSessionPassword,
  getMasterVaultKeyBytes,
  hasLegacyPrivateKeyEntries,
  stalePasskeyCeremonyResult,
} from "./status";
import { privateKeyMatchesAccount } from "../vault/accountIntegrity";
import {
  derivePrivateKey as deriveSeedPrivateKey,
  isValidMnemonic,
} from "../mnemonic/derivation";
import {
  clearAllAuthState,
  getPrivateKeyFromCache,
  setCachedMnemonicKey,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

async function prepareAndCommitPasskeyState(
  payload: PasskeyCredentialPayload,
  masterPassword: string,
  vaultKeyBytes: Uint8Array,
  requireCurrentMasterSession: boolean,
): Promise<{ success: boolean; error?: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, () =>
    withMnemonicVaultLock(async () => {
      if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
        return stalePasskeyCeremonyResult();
      }
      if (requireCurrentMasterSession) {
        try {
          assertCurrentMasterAuthorization(payload.authCeremonyEpoch);
        } catch {
          return stalePasskeyCeremonyResult();
        }
      }

      const existingMnemonicKey = await unlockMnemonicKeyWithPassword(
        masterPassword,
      );
      const mnemonicKeyBytes =
        existingMnemonicKey?.keyBytes ?? generateVaultKey();
      const mnemonicKey =
        existingMnemonicKey?.key ?? (await importVaultKey(mnemonicKeyBytes));
      const mnemonicKeyId = existingMnemonicKey?.keyId ?? crypto.randomUUID();
      const masterWrappedKey = await encryptVaultKey(
        mnemonicKeyBytes,
        masterPassword,
      );
      const generalVaultKey = await importVaultKey(vaultKeyBytes);
      const preparedMnemonicVault = await prepareMnemonicKeyVault(
        masterPassword,
        mnemonicKey,
        mnemonicKeyId,
        masterWrappedKey,
        generalVaultKey,
      );
      if (!preparedMnemonicVault) {
        return {
          success: false,
          error:
            "Seed phrases could not be verified. Biometric unlock was not changed.",
        };
      }

      const decrypted = await decryptMnemonicKeyVaultEntries(
        preparedMnemonicVault,
        mnemonicKey,
      );
      if (
        !decrypted ||
        decrypted.some(({ mnemonic }) => !isValidMnemonic(mnemonic))
      ) {
        return {
          success: false,
          error:
            "Seed phrases could not be verified. Biometric unlock was not changed.",
        };
      }

      const mnemonicByGroup = new Map(
        decrypted.map(({ id, mnemonic }) => [id, mnemonic]),
      );
      const accounts = await getAccounts();
      const seedAccounts = accounts.filter(
        (account) => account.type === "seedPhrase",
      );
      const localAccounts = accounts.filter(
        (account) =>
          account.type === "privateKey" || account.type === "seedPhrase",
      );
      for (const account of localAccounts) {
        const privateKey = getPrivateKeyFromCache(account.id);
        if (!privateKey || !privateKeyMatchesAccount(account, privateKey)) {
          return {
            success: false,
            error:
              "A local account does not match its encrypted key. Biometric unlock was not changed.",
          };
        }
      }
      for (const account of seedAccounts) {
        const mnemonic = mnemonicByGroup.get(account.seedGroupId);
        if (!mnemonic) {
          return {
            success: false,
            error:
              "A seed account is missing its recovery phrase. Biometric unlock was not changed.",
          };
        }
        const derivedAddress = deriveAddress(
          deriveSeedPrivateKey(mnemonic, account.derivationIndex),
        );
        if (derivedAddress.toLowerCase() !== account.address.toLowerCase()) {
          return {
            success: false,
            error:
              "A seed phrase does not match its account. Biometric unlock was not changed.",
          };
        }
      }

      const built = await buildPasskeyRecord(payload, vaultKeyBytes, {
        keyBytes: mnemonicKeyBytes,
        keyId: mnemonicKeyId,
      });
      if (!built.success || !built.record) return built;
      if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
        return stalePasskeyCeremonyResult();
      }
      if (requireCurrentMasterSession) {
        try {
          assertCurrentMasterAuthorization(payload.authCeremonyEpoch);
        } catch {
          return stalePasskeyCeremonyResult();
        }
      }

      await chrome.storage.local.set({
        mnemonicVault: preparedMnemonicVault,
        [PASSKEY_UNLOCK_STORAGE_KEY]: built.record,
      });
      setCachedMnemonicKey({ key: mnemonicKey, keyId: mnemonicKeyId });
      invalidateAuthCeremonies();
      return { success: true };
    }),
  );
}

export async function handleSetupPasskeyUnlock(
  payload: Partial<PasskeyCredentialPayload>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return stalePasskeyCeremonyResult();
  }

  try {
    const session = await getCurrentMasterSessionPassword(true);
    if (!session.success || !session.password) return session;
    const vaultKeyBytes = await getMasterVaultKeyBytes(session.password);
    if (!vaultKeyBytes) {
      return { success: false, error: "Failed to verify master password" };
    }
    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      {
        password: session.password,
        persistPasswordSession: true,
        migrateLegacyPrivateKeys: true,
        expectedMasterAuthEpoch: payload.authCeremonyEpoch,
      },
    );
    if (!hydrated.success) return hydrated;
    if (await hasLegacyPrivateKeyEntries()) {
      return {
        success: false,
        error: "Failed to migrate private keys for biometric unlock",
      };
    }
    return prepareAndCommitPasskeyState(
      payload,
      session.password,
      vaultKeyBytes,
      true,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === STALE_MASTER_AUTHORIZATION_ERROR
    ) {
      return stalePasskeyCeremonyResult();
    }
    console.error("[passkeyUnlock] Failed to set up biometric unlock:", error);
    return { success: false, error: "Failed to set up biometric unlock" };
  }
}

export async function handleSetupPasskeyUnlockWithPassword(
  payload: Partial<PasskeyCredentialPayload>,
  masterPassword: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey setup payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return stalePasskeyCeremonyResult();
  }

  let sessionHydrated = false;
  try {
    let vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);
    if (!vaultKeyBytes) {
      const hasVaultKeySystem = !!(await chrome.storage.local.get(
        "encryptedVaultKeyMaster",
      )).encryptedVaultKeyMaster;
      if (!hasVaultKeySystem) {
        const unlockResult = await handleUnlockWallet(masterPassword);
        if (!unlockResult.success || unlockResult.passwordType !== "master") {
          return { success: false, error: "Invalid master password" };
        }
        sessionHydrated = true;
        vaultKeyBytes = await getMasterVaultKeyBytes(masterPassword);
      }
    }
    if (!vaultKeyBytes) {
      if (sessionHydrated) await clearAllAuthState();
      return { success: false, error: "Invalid master password" };
    }

    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      {
        password: masterPassword,
        persistPasswordSession: true,
        migrateLegacyPrivateKeys: true,
      },
    );
    sessionHydrated = hydrated.success;
    if (!hydrated.success) {
      await clearAllAuthState();
      return hydrated;
    }
    if (await hasLegacyPrivateKeyEntries()) {
      await clearAllAuthState();
      return {
        success: false,
        error: "Failed to migrate private keys for biometric unlock",
      };
    }
    const committed = await prepareAndCommitPasskeyState(
      payload,
      masterPassword,
      vaultKeyBytes,
      false,
    );
    if (!committed.success) {
      await clearAllAuthState();
      return committed;
    }
    clearManualLockRestorationBlock();
    return { success: true };
  } catch (error) {
    if (sessionHydrated) await clearAllAuthState().catch(() => undefined);
    console.error("[passkeyUnlock] Failed to set up biometric unlock:", error);
    return { success: false, error: "Failed to set up biometric unlock" };
  }
}
