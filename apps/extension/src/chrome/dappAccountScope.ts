import {
  getDappPermission,
  getPendingDappConnectionRequests,
  normalizeDappOrigin,
} from "./dappPermissionStorage";

/**
 * Whether a tab may own an account override. Approved dapp origins and tabs
 * with an active connection prompt are the only scoped cases; normal browser
 * tabs use the shared global account.
 */
export async function tabHasDappAccountScope(tabId: number): Promise<boolean> {
  if (!Number.isInteger(tabId) || tabId < 0) return false;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const origin = normalizeDappOrigin(tab?.url);
  if (origin && (await getDappPermission(origin))) return true;

  const pending = await getPendingDappConnectionRequests();
  return pending.some((request) => request.tabId === tabId);
}
