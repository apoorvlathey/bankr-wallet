import {
  clearTabAccount,
  getAccountById,
  getActiveAccount,
  getTabAccount,
  getTabAccounts,
  setActiveAccountId,
  setTabAccount,
} from "./accountStorage";
import { tabHasDappAccountScope } from "./dappAccountScope";
import type { Account } from "./types";

export type AccountSelectionScope = "dapp-tab" | "global";

let latestActivation = 0;

async function setGlobalAccount(account: Account): Promise<void> {
  await setActiveAccountId(account.id);
  await chrome.storage.sync.set({
    address: account.address,
    displayAddress: account.displayName || account.address,
  });
}

/**
 * Resolve the account visible to a browser tab. Only connected/pending dapp
 * tabs retain a per-tab snapshot; every other tab follows the global account.
 */
export async function resolveBrowserTabAccount(
  tabId: number,
): Promise<Account | null> {
  if (await tabHasDappAccountScope(tabId)) {
    return getTabAccount(tabId);
  }

  await clearTabAccount(tabId);
  return getActiveAccount();
}

/**
 * Resolve a newly active browser tab. A connected dapp keeps its override and
 * also becomes the shared fallback for ordinary tabs; an ordinary tab only
 * consumes that fallback and never receives an override.
 */
export async function activateBrowserTabAccount(
  tabId: number,
): Promise<Account | null> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active) return resolveBrowserTabAccount(tabId);

  const activation = ++latestActivation;
  if (!(await tabHasDappAccountScope(tabId))) {
    await clearTabAccount(tabId);
    return getActiveAccount();
  }

  const account = await getTabAccount(tabId);
  if (account && activation === latestActivation) {
    await setGlobalAccount(account);
  }
  return account;
}

/**
 * Select an account using the same scope rule as resolution. Dapp tabs retain
 * an override and refresh the fallback. Ordinary tabs update only the fallback.
 */
export async function selectBrowserTabAccount(
  tabId: number,
  accountId: string,
): Promise<{ account: Account; scope: AccountSelectionScope }> {
  const account = await getAccountById(accountId);
  if (!account) throw new Error("Account not found");

  if (await tabHasDappAccountScope(tabId)) {
    await setTabAccount(tabId, accountId);
    await setGlobalAccount(account);
    return { account, scope: "dapp-tab" };
  }

  await clearTabAccount(tabId);
  await setGlobalAccount(account);
  return { account, scope: "global" };
}

/** Preserve a scoped override across Chrome's tab replacement lifecycle. */
export async function replaceBrowserTabAccountScope(
  addedTabId: number,
  removedTabId: number,
): Promise<void> {
  const tabAccounts = await getTabAccounts();
  const mappedAccountId = tabAccounts[removedTabId];
  await clearTabAccount(removedTabId);

  if (mappedAccountId && (await tabHasDappAccountScope(addedTabId))) {
    await setTabAccount(addedTabId, mappedAccountId);
  } else {
    await clearTabAccount(addedTabId);
  }
}
