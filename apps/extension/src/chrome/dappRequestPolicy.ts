import {
  getDappPermission,
  normalizeDappOrigin,
} from "./dappPermissionStorage";

export const DAPP_CONNECTION_REQUIRED_ERROR =
  "Connect this site to WalletChan before requesting transactions or signatures";

export const DAPP_CONNECTION_REQUIRED_CODE = 4100;

export type ConnectedDappAuthorization =
  | { authorized: true; origin: string; tabId: number }
  | { authorized: false; error: string; code: number };

/**
 * Resolves the browser-attested top-level origin for a provider request.
 * Page-supplied message fields are deliberately not authorization inputs.
 */
export function trustedTopLevelDappOrigin(
  sender: chrome.runtime.MessageSender,
): { origin: string; tabId: number } | null {
  if (sender.frameId !== undefined && sender.frameId !== 0) return null;
  if (typeof sender.tab?.id !== "number") return null;

  const origin = normalizeDappOrigin(sender.origin || sender.url);
  if (!origin) return null;

  // Fail closed across navigation races: the sender frame and current top-level
  // tab must still describe the same origin when Chrome provides both values.
  const tabOrigin = normalizeDappOrigin(sender.tab.url);
  if (tabOrigin && tabOrigin !== origin) return null;

  return { origin, tabId: sender.tab.id };
}

/**
 * Transactions and signatures are only accepted from a top-level site with an
 * existing exact-origin account-visibility grant.
 */
export async function authorizeConnectedDappRequest(
  sender: chrome.runtime.MessageSender,
): Promise<ConnectedDappAuthorization> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted || !(await getDappPermission(trusted.origin))) {
    return {
      authorized: false,
      error: DAPP_CONNECTION_REQUIRED_ERROR,
      code: DAPP_CONNECTION_REQUIRED_CODE,
    };
  }

  return { authorized: true, ...trusted };
}
