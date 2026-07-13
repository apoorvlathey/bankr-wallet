/**
 * Focused transport for non-secret account reads, ordering, naming, and selection.
 *
 * Secret creation, import, removal, reveal, and migration routes intentionally
 * remain outside this router. Account storage and tab-scope modules retain all
 * persistence and selection policy.
 */

import {
  getAccountById,
  getAccounts,
  getActiveAccount,
  reorderAccounts,
  setActiveAccountId,
  updateAccountDisplayName,
} from "../accountStorage";
import {
  activateBrowserTabAccount,
  resolveBrowserTabAccount,
  selectBrowserTabAccount,
} from "../tabAccountResolver";
import { isTrustedWalletUiSender } from "../trustedWalletUiSender";

export const BACKGROUND_ACCOUNT_STATE_MESSAGE_TYPES = [
  "getAccounts",
  "reorderAccounts",
  "getActiveAccount",
  "setActiveAccount",
  "getTabAccount",
  "setTabAccount",
  "updateAccountDisplayName",
] as const;

export type BackgroundAccountStateRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  getAccountById: typeof getAccountById;
  getAccounts: typeof getAccounts;
  getActiveAccount: typeof getActiveAccount;
  reorderAccounts: typeof reorderAccounts;
  setActiveAccountId: typeof setActiveAccountId;
  updateAccountDisplayName: typeof updateAccountDisplayName;
  activateBrowserTabAccount: typeof activateBrowserTabAccount;
  resolveBrowserTabAccount: typeof resolveBrowserTabAccount;
  selectBrowserTabAccount: typeof selectBrowserTabAccount;
  isTrustedWalletUiSender: typeof isTrustedWalletUiSender;
  setSyncStorage: (values: Record<string, unknown>) => Promise<void>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

const productionDependencies: Dependencies = {
  getAccountById,
  getAccounts,
  getActiveAccount,
  reorderAccounts,
  setActiveAccountId,
  updateAccountDisplayName,
  activateBrowserTabAccount,
  resolveBrowserTabAccount,
  selectBrowserTabAccount,
  isTrustedWalletUiSender,
  setSyncStorage: (values) => chrome.storage.sync.set(values),
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
};

const HANDLED_ASYNC: BackgroundAccountStateRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function broadcastAccountsUpdated(dependencies: Dependencies): void {
  void dependencies
    .sendRuntimeMessage({ type: "accountsUpdated" })
    .catch(() => {});
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundAccountStateMessageRouter(
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundAccountStateRouteResult {
  const dependencies: Dependencies = {
    ...productionDependencies,
    ...overrides,
  };

  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "getAccounts": {
        dependencies.getAccounts().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "reorderAccounts": {
        dependencies
          .reorderAccounts(message.accountIds)
          .then((accounts) => {
            broadcastAccountsUpdated(dependencies);
            sendResponse({ success: true, accounts });
          })
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to reorder accounts"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "getActiveAccount": {
        const accountPromise =
          !dependencies.isTrustedWalletUiSender(sender) &&
          typeof sender.tab?.id === "number"
            ? dependencies.resolveBrowserTabAccount(sender.tab.id)
            : dependencies.getActiveAccount();
        accountPromise.then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "setActiveAccount": {
        void (async () => {
          await dependencies.setActiveAccountId(message.accountId);
          const account = await dependencies.getAccountById(message.accountId);
          if (account) {
            await dependencies.setSyncStorage({
              address: account.address,
              displayAddress: account.displayName || account.address,
            });
          }
          broadcastAccountsUpdated(dependencies);
          sendResponse({ success: true });
        })();
        return HANDLED_ASYNC;
      }

      case "getTabAccount": {
        const tabId =
          typeof message.tabId === "number" ? message.tabId : sender.tab?.id;
        if (typeof tabId === "number") {
          const accountPromise = message.activate
            ? dependencies.activateBrowserTabAccount(tabId)
            : dependencies.resolveBrowserTabAccount(tabId);
          accountPromise.then(sendResponse);
        } else {
          dependencies.getActiveAccount().then(sendResponse);
        }
        return HANDLED_ASYNC;
      }

      case "setTabAccount": {
        const tabId =
          typeof message.tabId === "number" ? message.tabId : sender.tab?.id;
        if (typeof tabId !== "number") {
          sendResponse({ success: false, error: "No tab ID" });
          return HANDLED_ASYNC;
        }
        dependencies
          .selectBrowserTabAccount(tabId, message.accountId)
          .then(({ account, scope }) => {
            if (scope === "global") broadcastAccountsUpdated(dependencies);
            sendResponse({ success: true, account, scope });
          })
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to select account"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "updateAccountDisplayName": {
        const displayName =
          typeof message.displayName === "string"
            ? message.displayName.slice(0, 100)
            : "";
        dependencies
          .updateAccountDisplayName(message.accountId, displayName)
          .then(() => {
            broadcastAccountsUpdated(dependencies);
            sendResponse({ success: true });
          })
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to update"),
            }),
          );
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}

export const routeBackgroundAccountStateMessage =
  createBackgroundAccountStateMessageRouter();
