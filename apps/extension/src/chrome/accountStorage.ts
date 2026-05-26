/**
 * Account storage utilities for managing multiple accounts
 * Accounts metadata is stored in chrome.storage.local (accounts array)
 * Active account and tab-specific accounts are stored in chrome.storage.sync
 */

import type { Account, BankrAccount, PrivateKeyAccount, SeedPhraseAccount, ImpersonatorAccount, SeedGroup } from "./types";

const ACCOUNTS_STORAGE_KEY = "accounts";
const ACTIVE_ACCOUNT_ID_KEY = "activeAccountId";
const TAB_ACCOUNTS_KEY = "tabAccounts";
const SEED_GROUPS_KEY = "seedGroups";

/**
 * Gets all accounts from storage
 */
export async function getAccounts(): Promise<Account[]> {
  const result = await chrome.storage.local.get(ACCOUNTS_STORAGE_KEY);
  return result[ACCOUNTS_STORAGE_KEY] || [];
}

/**
 * Saves all accounts to storage
 */
async function saveAccounts(accounts: Account[]): Promise<void> {
  await chrome.storage.local.set({ [ACCOUNTS_STORAGE_KEY]: accounts });
}

/**
 * Gets a specific account by ID
 */
export async function getAccountById(id: string): Promise<Account | null> {
  const accounts = await getAccounts();
  return accounts.find((a) => a.id === id) || null;
}

/**
 * Gets the active account ID from storage
 */
export async function getActiveAccountId(): Promise<string | null> {
  const result = await chrome.storage.sync.get(ACTIVE_ACCOUNT_ID_KEY);
  return result[ACTIVE_ACCOUNT_ID_KEY] || null;
}

/**
 * Sets the active account ID
 */
export async function setActiveAccountId(accountId: string): Promise<void> {
  await chrome.storage.sync.set({ [ACTIVE_ACCOUNT_ID_KEY]: accountId });
}

/**
 * Gets the active account
 */
export async function getActiveAccount(): Promise<Account | null> {
  const activeId = await getActiveAccountId();
  if (!activeId) {
    // If no active account set, return the first account
    const accounts = await getAccounts();
    return accounts.length > 0 ? accounts[0] : null;
  }
  return getAccountById(activeId);
}

/**
 * Gets per-tab account overrides
 * Maps tabId -> accountId
 */
export async function getTabAccounts(): Promise<Record<number, string>> {
  const result = await chrome.storage.sync.get(TAB_ACCOUNTS_KEY);
  return result[TAB_ACCOUNTS_KEY] || {};
}

/**
 * Gets the account for a specific tab (or falls back to active account)
 */
export async function getTabAccount(tabId: number): Promise<Account | null> {
  const tabAccounts = await getTabAccounts();
  const accountId = tabAccounts[tabId];

  if (accountId) {
    const account = await getAccountById(accountId);
    if (account) {
      return account;
    }
    // Account was deleted, clear the tab mapping
    await clearTabAccount(tabId);
  }

  // Fall back to active account
  return getActiveAccount();
}

/**
 * Sets the account for a specific tab
 */
export async function setTabAccount(
  tabId: number,
  accountId: string
): Promise<void> {
  const tabAccounts = await getTabAccounts();
  tabAccounts[tabId] = accountId;
  await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
}

/**
 * Clears the account override for a specific tab
 */
export async function clearTabAccount(tabId: number): Promise<void> {
  const tabAccounts = await getTabAccounts();
  delete tabAccounts[tabId];
  await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
}

/**
 * Clears all tab account mappings
 */
export async function clearAllTabAccounts(): Promise<void> {
  await chrome.storage.sync.remove(TAB_ACCOUNTS_KEY);
}

/**
 * Adds a Bankr API account
 */
export async function addBankrAccount(
  address: string,
  displayName?: string
): Promise<BankrAccount> {
  const accounts = await getAccounts();

  const newAccount: BankrAccount = {
    id: crypto.randomUUID(),
    type: "bankr",
    address: address.toLowerCase(),
    displayName,
    createdAt: Date.now(),
  };

  accounts.push(newAccount);
  await saveAccounts(accounts);
  await setActiveAccountId(newAccount.id);

  return newAccount;
}

/**
 * Adds a Private Key account
 * Note: The actual private key is stored separately in the vault
 */
export async function addPrivateKeyAccount(
  address: string,
  displayName?: string
): Promise<PrivateKeyAccount> {
  const accounts = await getAccounts();

  const newAccount: PrivateKeyAccount = {
    id: crypto.randomUUID(),
    type: "privateKey",
    address: address.toLowerCase(),
    displayName,
    createdAt: Date.now(),
  };

  accounts.push(newAccount);
  await saveAccounts(accounts);
  await setActiveAccountId(newAccount.id);

  return newAccount;
}

/**
 * Adds an Impersonator (view-only) account
 * No secrets stored - just address metadata
 */
export async function addImpersonatorAccount(
  address: string,
  displayName?: string
): Promise<ImpersonatorAccount> {
  const accounts = await getAccounts();

  const newAccount: ImpersonatorAccount = {
    id: crypto.randomUUID(),
    type: "impersonator",
    address: address.toLowerCase(),
    displayName,
    createdAt: Date.now(),
  };

  accounts.push(newAccount);
  await saveAccounts(accounts);
  await setActiveAccountId(newAccount.id);

  return newAccount;
}

/**
 * Removes an account by ID
 * Note: Does NOT remove the private key from vault - caller must do that
 */
export async function removeAccount(accountId: string): Promise<void> {
  const accounts = await getAccounts();
  const filteredAccounts = accounts.filter((a) => a.id !== accountId);
  await saveAccounts(filteredAccounts);

  // If the removed account was active, set a new active account
  const activeId = await getActiveAccountId();
  if (activeId === accountId) {
    if (filteredAccounts.length > 0) {
      await setActiveAccountId(filteredAccounts[0].id);
    } else {
      await chrome.storage.sync.remove(ACTIVE_ACCOUNT_ID_KEY);
    }
  }

  // Clear any tab mappings to this account
  const tabAccounts = await getTabAccounts();
  let changed = false;
  for (const tabId in tabAccounts) {
    if (tabAccounts[tabId] === accountId) {
      delete tabAccounts[tabId];
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
  }

  // Drop any EIP-7702 custom-delegate overrides the user configured for this
  // account. The onchain delegation (if any) remains — that's a property of
  // the EOA address itself, not of our storage. If the user re-imports the
  // same EOA, the onchain probe will still detect it.
  try {
    const { removeAllDelegatesForAccount } = await import(
      "./delegationStorage"
    );
    await removeAllDelegatesForAccount(accountId);
  } catch {
    /* ignore */
  }
}

/**
 * Updates an account's display name
 */
export async function updateAccountDisplayName(
  accountId: string,
  displayName: string
): Promise<void> {
  const accounts = await getAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.displayName = displayName;
    await saveAccounts(accounts);
  }
}

/**
 * Clears all accounts (used during reset)
 */
export async function clearAllAccounts(): Promise<void> {
  await chrome.storage.local.remove(ACCOUNTS_STORAGE_KEY);
  await chrome.storage.sync.remove([ACTIVE_ACCOUNT_ID_KEY, TAB_ACCOUNTS_KEY]);
}

/**
 * Gets accounts by type
 */
export async function getAccountsByType(
  type: "bankr" | "privateKey" | "seedPhrase" | "impersonator"
): Promise<Account[]> {
  const accounts = await getAccounts();
  return accounts.filter((a) => a.type === type);
}

/**
 * Checks if an address already exists in accounts
 */
export async function addressExists(address: string): Promise<boolean> {
  const accounts = await getAccounts();
  return accounts.some((a) => a.address.toLowerCase() === address.toLowerCase());
}

/**
 * Adds a Seed Phrase derived account
 */
export async function addSeedPhraseAccount(
  address: string,
  seedGroupId: string,
  derivationIndex: number,
  displayName?: string
): Promise<SeedPhraseAccount> {
  const accounts = await getAccounts();

  const newAccount: SeedPhraseAccount = {
    id: crypto.randomUUID(),
    type: "seedPhrase",
    address: address.toLowerCase(),
    seedGroupId,
    derivationIndex,
    displayName,
    createdAt: Date.now(),
  };

  accounts.push(newAccount);
  await saveAccounts(accounts);
  await setActiveAccountId(newAccount.id);

  return newAccount;
}

/**
 * Gets all seed groups
 */
export async function getSeedGroups(): Promise<SeedGroup[]> {
  const result = await chrome.storage.local.get(SEED_GROUPS_KEY);
  return result[SEED_GROUPS_KEY] || [];
}

/**
 * Adds a new seed group
 */
export async function addSeedGroup(name?: string): Promise<SeedGroup> {
  const groups = await getSeedGroups();
  const nextNum = groups.length + 1;

  const group: SeedGroup = {
    id: crypto.randomUUID(),
    name: name || `Seed #${nextNum}`,
    createdAt: Date.now(),
    accountCount: 0,
  };

  groups.push(group);
  await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
  return group;
}

/**
 * Updates seed group account count
 */
export async function updateSeedGroupCount(
  seedGroupId: string,
  accountCount: number
): Promise<void> {
  const groups = await getSeedGroups();
  const group = groups.find((g) => g.id === seedGroupId);
  if (group) {
    group.accountCount = accountCount;
    await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
  }
}

/**
 * Renames a seed group
 */
export async function renameSeedGroup(
  seedGroupId: string,
  newName: string
): Promise<void> {
  const groups = await getSeedGroups();
  const group = groups.find((g) => g.id === seedGroupId);
  if (group) {
    group.name = newName;
    await chrome.storage.local.set({ [SEED_GROUPS_KEY]: groups });
  }
}

/**
 * Removes a seed group
 */
export async function removeSeedGroup(seedGroupId: string): Promise<void> {
  const groups = await getSeedGroups();
  const filtered = groups.filter((g) => g.id !== seedGroupId);
  await chrome.storage.local.set({ [SEED_GROUPS_KEY]: filtered });
}

/**
 * Finds an account by address (case-insensitive)
 */
export async function findAccountByAddress(address: string): Promise<Account | null> {
  const accounts = await getAccounts();
  return accounts.find((a) => a.address.toLowerCase() === address.toLowerCase()) || null;
}

/**
 * Converts a private key account to a seed phrase account in-place.
 * Preserves the same account ID, display name, and vault entry.
 */
export async function convertToSeedPhraseAccount(
  accountId: string,
  seedGroupId: string,
  derivationIndex: number
): Promise<SeedPhraseAccount | null> {
  const accounts = await getAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index === -1) return null;

  const existing = accounts[index];
  const converted: SeedPhraseAccount = {
    id: existing.id,
    type: "seedPhrase",
    address: existing.address,
    displayName: existing.displayName,
    createdAt: existing.createdAt,
    seedGroupId,
    derivationIndex,
  };

  accounts[index] = converted;
  await saveAccounts(accounts);
  await setActiveAccountId(converted.id);
  return converted;
}

/**
 * Gets the first account (useful for migration from old single-account storage)
 */
export async function getFirstAccount(): Promise<Account | null> {
  const accounts = await getAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}
