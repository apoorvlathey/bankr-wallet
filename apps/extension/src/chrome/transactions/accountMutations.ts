import {
  addPrivateKeyAccount as addPKAccountStorage,
  getAccountById,
  getAccounts,
  removeAccount,
  removeSeedGroup,
  updateSeedGroupCount,
} from "../accountStorage";
import { deriveAddress } from "../localSigner";
import {
  assertCurrentMasterAuthorization,
  hasCurrentMasterAuthorization,
} from "../masterAuthorization";
import { removeMnemonic } from "../mnemonicStorage";
import { clearNoncesForAddress } from "../forceInclusion/nonceManager";
import {
  getCachedVault,
  setCachedVault,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type { Account } from "../types";
import { addKeyToVault, removeKeyFromVault } from "../vaultCrypto";
import { removeLedgerDeviceIfUnused } from "../ledger/storage";
import { removeSafeAccountRecord } from "../safe/accountRepository";

/** Adds one locally encrypted private-key account. */
export async function handleAddPrivateKeyAccount(
  privateKey: `0x${string}`,
  password?: string,
  displayName?: string,
  expectedAuthEpoch?: string,
): Promise<{ success: boolean; account?: Account; error?: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      if (expectedAuthEpoch) {
        assertCurrentMasterAuthorization(expectedAuthEpoch);
      }
      const address = deriveAddress(privateKey);

      const duplicateAccount = (await getAccounts()).find(
        (account) =>
          account.address.toLowerCase() === address.toLowerCase() &&
          account.type !== "impersonator",
      );
      if (duplicateAccount) {
        return {
          success: false,
          error: "An account with this address already exists",
        };
      }

      // Persist the key first so a later failure leaves an encrypted orphan,
      // never a visible account without its signing key.
      const accountId = crypto.randomUUID();
      await addKeyToVault(
        accountId,
        privateKey,
        password,
        expectedAuthEpoch,
      );

      let account: Account;
      try {
        account = await addPKAccountStorage(
          address,
          displayName,
          accountId,
          expectedAuthEpoch,
        );
      } catch (error) {
        await removeKeyFromVault(accountId).catch(() => undefined);
        throw error;
      }

      const cachedVaultEntries = getCachedVault();
      if (
        cachedVaultEntries &&
        (!expectedAuthEpoch ||
          hasCurrentMasterAuthorization(expectedAuthEpoch))
      ) {
        cachedVaultEntries.push({ id: account.id, privateKey });
        setCachedVault(cachedVaultEntries);
      }

      chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});
      return { success: true, account };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add account",
      };
    }
  });
}

/** Removes account metadata before cleaning up its encrypted key material. */
export async function handleRemoveAccount(
  accountId: string,
  expectedAuthEpoch?: string,
): Promise<{ success: boolean; error?: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      if (expectedAuthEpoch) {
        assertCurrentMasterAuthorization(expectedAuthEpoch);
      }
      const account = await getAccountById(accountId);
      if (!account) {
        return { success: false, error: "Account not found" };
      }

      const allAccounts = await getAccounts();
      if (allAccounts.length <= 1) {
        return { success: false, error: "Cannot remove the last account" };
      }

      let seedGroupId: string | null = null;
      let remainingSeedAccounts: Account[] = [];
      if (account.type === "seedPhrase") {
        seedGroupId = account.seedGroupId;
        remainingSeedAccounts = allAccounts.filter(
          (candidate) =>
            candidate.type === "seedPhrase" &&
            candidate.seedGroupId === seedGroupId &&
            candidate.id !== accountId,
        );
      }

      if (account.type === "safe") {
        await removeSafeAccountRecord(accountId, { walletSecretLockHeld: true });
      } else {
        await removeAccount(accountId, expectedAuthEpoch);
      }

      if (account.type === "privateKey" || account.type === "seedPhrase") {
        clearNoncesForAddress(account.address);
        await removeKeyFromVault(accountId);

        const cachedVaultEntries = getCachedVault();
        if (
          cachedVaultEntries &&
          (!expectedAuthEpoch ||
            hasCurrentMasterAuthorization(expectedAuthEpoch))
        ) {
          setCachedVault(
            cachedVaultEntries.filter((entry) => entry.id !== accountId),
          );
        }
      }
      if (account.type === "ledger") {
        clearNoncesForAddress(account.address);
        await removeLedgerDeviceIfUnused(
          account.deviceId,
          expectedAuthEpoch,
        );
      }

      if (seedGroupId) {
        if (remainingSeedAccounts.length === 0) {
          await removeMnemonic(seedGroupId);
          await removeSeedGroup(seedGroupId);
        } else {
          await updateSeedGroupCount(
            seedGroupId,
            remainingSeedAccounts.length,
          );
        }
      }

      chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to remove account",
      };
    }
  });
}
