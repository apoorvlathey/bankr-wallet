import { getTabAccounts } from "../accountStorage";
import {
  getDappPermission,
  normalizeDappOrigin,
  removePendingDappConnectionRequests,
} from "../requests/dappPermissionStorage";
import { withStorageLock } from "../storageLock";

export type RevokeDappOrigin = (origin: string) => Promise<unknown>;
const DAPP_ACCOUNT_BINDING_LOCK_KEY = "operation:dapp-account-binding";

const ACCOUNT_REMOVED_CONNECTION_ERROR =
  "Connection cancelled because the selected account is being removed";

/** Serialize connection grants with account-removal privacy teardown. */
export function withDappAccountBinding<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return withStorageLock(DAPP_ACCOUNT_BINDING_LOCK_KEY, operation);
}

/**
 * Disconnect every currently connected exact origin whose tab is scoped to an
 * account about to be removed. Dapp grants are origin-wide, so every open tab
 * for a matching origin is intentionally disconnected by the supplied revoke
 * operation. This runs before account metadata is deleted: clearing a tab
 * mapping first would let the next account lookup silently snapshot and expose
 * the wallet's unrelated global fallback account.
 */
export async function disconnectDappsMappedToRemovedAccount(
  accountId: string,
  revokeOrigin: RevokeDappOrigin,
): Promise<string[]> {
  if (!accountId) return [];

  const tabAccounts = await getTabAccounts();
  const affectedTabIds = new Set(
    Object.entries(tabAccounts)
      .filter(([, mappedAccountId]) => mappedAccountId === accountId)
      .map(([rawTabId]) => Number(rawTabId))
      .filter((tabId) => Number.isInteger(tabId) && tabId >= 0),
  );

  // A connection confirmation is serialized by DAPP_ACCOUNT_BINDING_LOCK_KEY.
  // Removing its durable prompt here therefore guarantees that a confirmation
  // which was queued behind account deletion cannot grant the fallback account.
  const cancelledConnections = await removePendingDappConnectionRequests(
    (request) =>
      typeof request.tabId === "number" && affectedTabIds.has(request.tabId),
  );
  await Promise.all(
    cancelledConnections.map((request) =>
      chrome.storage.local.set({
        [`dappConnectionResult:${request.id}`]: {
          result: {
            success: false,
            error: ACCOUNT_REMOVED_CONNECTION_ERROR,
            code: 4100,
          },
          timestamp: Date.now(),
        },
      }),
    ),
  );

  const origins = new Set<string>();
  await Promise.all(
    [...affectedTabIds].map(async (tabId) => {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const origin = normalizeDappOrigin(tab?.url);
      if (origin && (await getDappPermission(origin))) origins.add(origin);
    }),
  );

  // Keep ordering deterministic for tests and diagnostics. Revocations are
  // awaited so account deletion cannot open a fallback-account exposure gap.
  const connectedOrigins = [...origins].sort();
  for (const origin of connectedOrigins) {
    await revokeOrigin(origin);
  }
  return connectedOrigins;
}

/** Enforce disconnect-before-delete as one semantic operation. */
export async function removeAccountWithDappPrivacyBoundary<T>(options: {
  accountId: string;
  revokeOrigin: RevokeDappOrigin;
  validateRemoval?: () => Promise<void>;
  removeAccount: () => Promise<T>;
}): Promise<T> {
  return withDappAccountBinding(async () => {
    await options.validateRemoval?.();
    await disconnectDappsMappedToRemovedAccount(
      options.accountId,
      options.revokeOrigin,
    );
    return options.removeAccount();
  });
}
