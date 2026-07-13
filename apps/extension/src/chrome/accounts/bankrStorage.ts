/** Bankr account metadata changes that must commit with credential updates. */

import type { BankrAccount } from "../types";
import { withStorageLock } from "../storageLock";
import {
  ACCOUNTS_LOCK_KEY,
  ACCOUNTS_STORAGE_KEY,
  getAccounts,
  normalizeEvmAccountAddress,
} from "./repository";
import { assertAccountStorageAuthorized } from "./authorization";
import { setActiveAccountId } from "./selectionStorage";

export async function addBankrAccount(
  address: string,
  displayName?: string,
  expectedAuthEpoch?: string,
): Promise<BankrAccount> {
  const account = await addBankrAccountWithCredentialUpdate(
    address,
    displayName,
    {},
    expectedAuthEpoch,
  );
  await setActiveAccountId(account.id, expectedAuthEpoch).catch((error) => {
    console.warn("[accountStorage] Failed to select newly added account:", error);
  });
  return account;
}

/** Commit account metadata and its prepared encrypted credential atomically. */
export async function addBankrAccountWithCredentialUpdate(
  address: string,
  displayName: string | undefined,
  credentialUpdate: Record<string, unknown>,
  expectedAuthEpoch?: string,
): Promise<BankrAccount> {
  return withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    if (accounts.some((account) => account.type === "bankr")) {
      throw new Error(
        "Only one Bankr account can be added because its API credential is wallet-wide",
      );
    }
    const normalizedAddress = normalizeEvmAccountAddress(address);
    if (
      accounts.some(
        (account) =>
          account.type !== "impersonator" &&
          account.address.toLowerCase() === normalizedAddress,
      )
    ) {
      throw new Error("An account with this address already exists");
    }

    const account: BankrAccount = {
      id: crypto.randomUUID(),
      type: "bankr",
      address: normalizedAddress,
      displayName,
      createdAt: Date.now(),
    };
    accounts.push(account);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({
      ...credentialUpdate,
      [ACCOUNTS_STORAGE_KEY]: accounts,
    });
    return account;
  });
}

export async function validateBankrAccountAddressUpdate(
  accountId: string,
  address: string,
): Promise<void> {
  const accounts = await getAccounts();
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("Account not found");
  if (account.type !== "bankr") {
    throw new Error("Only Bankr accounts can update API wallet addresses");
  }

  const normalized = normalizeEvmAccountAddress(address);
  if (
    accounts.some(
      (candidate) =>
        candidate.id !== accountId &&
        candidate.address.toLowerCase() === normalized,
    )
  ) {
    throw new Error("An account with this address already exists");
  }
}

export async function updateBankrAccountAddress(
  accountId: string,
  address: string,
  expectedAuthEpoch?: string,
): Promise<BankrAccount> {
  return updateBankrAccountAddressWithCredentialUpdate(
    accountId,
    address,
    {},
    expectedAuthEpoch,
  );
}

/**
 * Commit address rotation and prepared credential in one write. The account
 * array is assigned last so additional fields cannot override it.
 */
export async function updateBankrAccountAddressWithCredentialUpdate(
  accountId: string,
  address: string,
  credentialUpdate: Record<string, unknown>,
  expectedAuthEpoch?: string,
): Promise<BankrAccount> {
  return withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const index = accounts.findIndex((account) => account.id === accountId);
    const account = accounts[index];
    if (!account) throw new Error("Account not found");
    if (account.type !== "bankr") {
      throw new Error("Only Bankr accounts can update API wallet addresses");
    }

    const normalized = normalizeEvmAccountAddress(address);
    if (
      accounts.some(
        (candidate) =>
          candidate.id !== accountId &&
          candidate.address.toLowerCase() === normalized,
      )
    ) {
      throw new Error("An account with this address already exists");
    }

    const updated: BankrAccount = {
      ...account,
      type: "bankr",
      address: normalized,
    };
    accounts[index] = updated;
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.local.set({
      ...credentialUpdate,
      [ACCOUNTS_STORAGE_KEY]: accounts,
    });
    return updated;
  });
}
