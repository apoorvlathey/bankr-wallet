/** ERC-7715 permission query, revoke, and provider-method transport. */

export const BACKGROUND_ERC7715_PERMISSION_MESSAGE_TYPES = [
  "getPendingErc7715PermissionRequests",
  "getErc7715PermissionGrantsForAccount",
  "initiateErc7715PermissionRevoke",
  "walletExecutionPermissions",
] as const;

export type BackgroundErc7715PermissionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundErc7715PermissionDependencies = {
  getPendingRequests: () => Promise<any[]>;
  getActiveGrantsWithOnchainSync: (input: {
    accountId: string;
  }) => Promise<any[]>;
  initiateRevoke: (input: {
    accountId: string;
    grantId: string;
  }) => Promise<any>;
  authorizeConnectedDappRequest: (
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  isPermissionMethod: (method: string) => boolean;
  getTabAccount: (tabId: number) => Promise<any>;
  handlePermissionMethod: (input: any) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundErc7715PermissionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundErc7715PermissionMessageRouter(
  dependencies: BackgroundErc7715PermissionDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundErc7715PermissionRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "getPendingErc7715PermissionRequests":
        dependencies.getPendingRequests().then(sendResponse);
        return HANDLED_ASYNC;

      case "getErc7715PermissionGrantsForAccount": {
        const accountId =
          typeof message.accountId === "string" ? message.accountId : "";
        if (!accountId) {
          sendResponse({ success: false, error: "Account id is required" });
          return HANDLED_ASYNC;
        }

        dependencies
          .getActiveGrantsWithOnchainSync({ accountId })
          .then((grants) => grants.sort((a, b) => b.createdAt - a.createdAt))
          .then((grants) => sendResponse({ success: true, grants }))
          .catch((error) =>
            sendResponse({
              success: false,
              error: (error as { message?: string })?.message,
            }),
          );
        return HANDLED_ASYNC;
      }

      case "initiateErc7715PermissionRevoke": {
        const accountId =
          typeof message.accountId === "string" ? message.accountId : "";
        const grantId =
          typeof message.grantId === "string" ? message.grantId : "";
        if (!accountId || !grantId) {
          sendResponse({
            success: false,
            error: "Account id and grant id are required",
          });
          return HANDLED_ASYNC;
        }

        dependencies
          .initiateRevoke({ accountId, grantId })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: (error as { message?: string })?.message,
            }),
          );
        return HANDLED_ASYNC;
      }

      case "walletExecutionPermissions":
        void (async () => {
          try {
            const authorization =
              await dependencies.authorizeConnectedDappRequest(sender);
            if (!authorization.authorized) {
              sendResponse({
                success: false,
                error: authorization.error,
                code: authorization.code,
              });
              return;
            }
            if (!dependencies.isPermissionMethod(message.method)) {
              throw new Error(
                `Unsupported execution permission method: ${message.method}`,
              );
            }

            const account =
              typeof sender.tab?.id === "number"
                ? await dependencies.getTabAccount(sender.tab.id)
                : undefined;
            const result = await dependencies.handlePermissionMethod({
              method: message.method,
              params: Array.isArray(message.params) ? message.params : [],
              origin: authorization.origin,
              chainId:
                typeof message.chainId === "number"
                  ? message.chainId
                  : undefined,
              favicon: message.favicon || null,
              senderWindowId: sender.tab?.windowId,
              senderOrigin: authorization.origin,
              tabId: authorization.tabId,
              frameId: sender.frameId,
              account: account ?? undefined,
              requestId:
                typeof message.requestId === "string"
                  ? message.requestId
                  : undefined,
              waitForResult:
                message.method !== "wallet_requestExecutionPermissions",
            });
            sendResponse({ success: true, result });
          } catch (error) {
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                "Execution permission request failed",
              ),
            });
          }
        })();
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
