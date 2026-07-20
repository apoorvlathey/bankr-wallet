/**
 * Lowest-level account metadata repository.
 *
 * This module owns the `accounts` storage record and read-only queries. It does
 * not select accounts, mutate credentials, or touch seed/private-key vaults.
 */

import type { Account, AccountType } from "../types";
import {
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

export const ACCOUNTS_STORAGE_KEY = "accounts";
export const ACCOUNTS_LOCK_KEY = WALLET_SECRET_STORAGE_LOCK_KEY;

export function normalizeEvmAccountAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid account address");
  }
  return address.toLowerCase();
}

export async function getAccounts(): Promise<Account[]> {
  const result = await chrome.storage.local.get(ACCOUNTS_STORAGE_KEY);
  return result[ACCOUNTS_STORAGE_KEY] || [];
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await chrome.storage.local.set({ [ACCOUNTS_STORAGE_KEY]: accounts });
}

/**
 * Persist an exact permutation of the stored account IDs. Requiring an exact
 * match prevents a stale renderer from adding, dropping, or duplicating rows.
 */
export async function reorderAccounts(accountIds: unknown): Promise<Account[]> {
  if (
    !Array.isArray(accountIds) ||
    accountIds.some((accountId) => typeof accountId !== "string")
  ) {
    throw new Error("Invalid account order");
  }

  return withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    const storedById = new Map(accounts.map((account) => [account.id, account]));
    const submittedIds = new Set(accountIds);

    if (
      storedById.size !== accounts.length ||
      submittedIds.size !== accountIds.length ||
      accountIds.length !== accounts.length ||
      accountIds.some((accountId) => !storedById.has(accountId))
    ) {
      throw new Error("Account order is out of date");
    }

    const reordered = accountIds.map((accountId) => storedById.get(accountId)!);
    await saveAccounts(reordered);
    return reordered;
  });
}

export async function getAccountById(id: string): Promise<Account | null> {
  const accounts = await getAccounts();
  return accounts.find((account) => account.id === id) || null;
}

export async function updateAccountDisplayName(
  accountId: string,
  displayName: string,
): Promise<void> {
  await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (account) {
      account.displayName = displayName;
      await saveAccounts(accounts);
    }
  });
}

export async function getAccountsByType(
  type: AccountType,
): Promise<Account[]> {
  const accounts = await getAccounts();
  return accounts.filter((account) => account.type === type);
}

export async function addressExists(address: string): Promise<boolean> {
  const accounts = await getAccounts();
  return accounts.some(
    (account) => account.address.toLowerCase() === address.toLowerCase(),
  );
}

export async function findAccountByAddress(
  address: string,
): Promise<Account | null> {
  const accounts = await getAccounts();
  return (
    accounts.find(
      (account) => account.address.toLowerCase() === address.toLowerCase(),
    ) || null
  );
}

/** View-only rows may coexist with a real signer for the same address. */
export async function findNonImpersonatorAccountByAddress(
  address: string,
): Promise<Account | null> {
  const normalized = address.toLowerCase();
  const accounts = await getAccounts();
  return (
    accounts.find(
      (account) =>
        account.type !== "impersonator" &&
        account.address.toLowerCase() === normalized,
    ) || null
  );
}

export async function getFirstAccount(): Promise<Account | null> {
  const accounts = await getAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}
