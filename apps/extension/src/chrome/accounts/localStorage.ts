/** Private-key and view-only account metadata mutations. */

import type { ImpersonatorAccount, PrivateKeyAccount } from "../types";
import { withStorageLock } from "../storageLock";
import {
  ACCOUNTS_LOCK_KEY,
  ACCOUNTS_STORAGE_KEY,
  getAccounts,
  normalizeEvmAccountAddress,
  saveAccounts,
} from "./repository";
import { assertAccountStorageAuthorized } from "./authorization";
import {
  clearAccountSelection,
  repairSelectionAfterRemoval,
  setActiveAccountId,
} from "./selectionStorage";

function assertUniqueSignerAddress(
  accounts: Awaited<ReturnType<typeof getAccounts>>,
  address: string,
): void {
  if (
    accounts.some(
      (account) =>
        account.type !== "impersonator" &&
        account.address.toLowerCase() === address,
    )
  ) {
    throw new Error("An account with this address already exists");
  }
}

export async function addPrivateKeyAccount(
  address: string,
  displayName?: string,
  accountId = crypto.randomUUID(),
  expectedAuthEpoch?: string,
): Promise<PrivateKeyAccount> {
  const newAccount = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const normalizedAddress = normalizeEvmAccountAddress(address);
    assertUniqueSignerAddress(accounts, normalizedAddress);
    const account: PrivateKeyAccount = {
      id: accountId,
      type: "privateKey",
      address: normalizedAddress,
      displayName,
      createdAt: Date.now(),
    };
    accounts.push(account);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await saveAccounts(accounts);
    return account;
  });
  await setActiveAccountId(newAccount.id, expectedAuthEpoch).catch((error) => {
    console.warn("[accountStorage] Failed to select newly added account:", error);
  });
  return newAccount;
}

export async function addImpersonatorAccount(
  address: string,
  displayName?: string,
  expectedAuthEpoch?: string,
): Promise<ImpersonatorAccount> {
  const newAccount = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const account: ImpersonatorAccount = {
      id: crypto.randomUUID(),
      type: "impersonator",
      address: normalizeEvmAccountAddress(address),
      displayName,
      createdAt: Date.now(),
    };
    accounts.push(account);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await saveAccounts(accounts);
    return account;
  });
  await setActiveAccountId(newAccount.id, expectedAuthEpoch).catch((error) => {
    console.warn("[accountStorage] Failed to select newly added account:", error);
  });
  return newAccount;
}

/** Caller remains responsible for deleting any matching secret-vault entry. */
export async function removeAccount(
  accountId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  const remaining = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    const next = accounts.filter((account) => account.id !== accountId);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await saveAccounts(next);
    return next;
  });

  await repairSelectionAfterRemoval(accountId, remaining);

  // Stored overrides are local preferences. Any onchain delegation remains a
  // property of the EOA and will be detected if the account is re-imported.
  try {
    const { removeAllDelegatesForAccount } = await import("../delegationStorage");
    await removeAllDelegatesForAccount(accountId);
  } catch {
    // Cleanup is best effort and must not undo the committed account removal.
  }
}

export async function clearAllAccounts(): Promise<void> {
  await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    await chrome.storage.local.remove(ACCOUNTS_STORAGE_KEY);
  });
  await clearAccountSelection();
}
