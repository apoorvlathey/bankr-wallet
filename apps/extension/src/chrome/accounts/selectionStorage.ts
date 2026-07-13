/** Global and per-tab account selection mirrors stored in sync storage. */

import type { Account } from "../types";
import { withStorageLock } from "../storageLock";
import {
  getAccountById,
  getAccounts,
} from "./repository";
import { assertAccountStorageAuthorized } from "./authorization";

const ACTIVE_ACCOUNT_ID_KEY = "activeAccountId";
const TAB_ACCOUNTS_KEY = "tabAccounts";
const ACTIVE_ACCOUNT_LOCK_KEY = `sync:${ACTIVE_ACCOUNT_ID_KEY}`;
const TAB_ACCOUNTS_LOCK_KEY = `sync:${TAB_ACCOUNTS_KEY}`;

export async function getActiveAccountId(): Promise<string | null> {
  const result = await chrome.storage.sync.get(ACTIVE_ACCOUNT_ID_KEY);
  return result[ACTIVE_ACCOUNT_ID_KEY] || null;
}

export async function setActiveAccountId(
  accountId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withStorageLock(ACTIVE_ACCOUNT_LOCK_KEY, async () => {
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await chrome.storage.sync.set({ [ACTIVE_ACCOUNT_ID_KEY]: accountId });
  });
}

export async function getActiveAccount(): Promise<Account | null> {
  const activeId = await getActiveAccountId();
  if (activeId) {
    const active = await getAccountById(activeId);
    if (active) return active;
  }

  // Repair stale/missing selection mirrors left by early multi-account builds.
  return withStorageLock(ACTIVE_ACCOUNT_LOCK_KEY, async () => {
    const [latestActiveId, accounts] = await Promise.all([
      chrome.storage.sync
        .get(ACTIVE_ACCOUNT_ID_KEY)
        .then((result) => result[ACTIVE_ACCOUNT_ID_KEY] || null),
      getAccounts(),
    ]);
    const latestActive = latestActiveId
      ? accounts.find((account) => account.id === latestActiveId) || null
      : null;
    if (latestActive) return latestActive;

    const fallback = accounts[0] || null;
    if (fallback) {
      await chrome.storage.sync.set({ [ACTIVE_ACCOUNT_ID_KEY]: fallback.id });
    } else if (latestActiveId) {
      await chrome.storage.sync.remove(ACTIVE_ACCOUNT_ID_KEY);
    }
    return fallback;
  });
}

export async function getTabAccounts(): Promise<Record<number, string>> {
  const result = await chrome.storage.sync.get(TAB_ACCOUNTS_KEY);
  return result[TAB_ACCOUNTS_KEY] || {};
}

/**
 * Snapshot the global account on first use so later global changes do not
 * silently switch an established dapp tab.
 */
export async function getTabAccount(tabId: number): Promise<Account | null> {
  return withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
    const tabAccounts = await getTabAccounts();
    const accountId = tabAccounts[tabId];

    if (accountId) {
      const account = await getAccountById(accountId);
      if (account) return account;
      delete tabAccounts[tabId];
    }

    const fallback = await getActiveAccount();
    if (fallback) {
      tabAccounts[tabId] = fallback.id;
      await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
    } else if (accountId) {
      await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
    }
    return fallback;
  });
}

export async function setTabAccount(
  tabId: number,
  accountId: string,
): Promise<void> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error("Account not found");

  await withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
    const tabAccounts = await getTabAccounts();
    tabAccounts[tabId] = accountId;
    await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
  });
}

export async function clearTabAccount(tabId: number): Promise<void> {
  await withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
    const tabAccounts = await getTabAccounts();
    delete tabAccounts[tabId];
    await chrome.storage.sync.set({ [TAB_ACCOUNTS_KEY]: tabAccounts });
  });
}

export async function clearAllTabAccounts(): Promise<void> {
  await withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
    await chrome.storage.sync.remove(TAB_ACCOUNTS_KEY);
  });
}

export async function clearAccountSelection(): Promise<void> {
  await withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
    await chrome.storage.sync.remove([ACTIVE_ACCOUNT_ID_KEY, TAB_ACCOUNTS_KEY]);
  });
}

export async function repairSelectionAfterRemoval(
  accountId: string,
  remainingAccounts: Account[],
): Promise<void> {
  const activeId = await getActiveAccountId();
  if (activeId === accountId) {
    if (remainingAccounts.length > 0) {
      await setActiveAccountId(remainingAccounts[0].id);
    } else {
      await chrome.storage.sync.remove(ACTIVE_ACCOUNT_ID_KEY);
    }
  }

  await withStorageLock(TAB_ACCOUNTS_LOCK_KEY, async () => {
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
  });
}
