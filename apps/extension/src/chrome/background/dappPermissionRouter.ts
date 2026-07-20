/**
 * Focused transport for injected dapp requests and trusted-UI permission
 * management. It runs only after the composition root's audience, sender, and
 * provider-envelope gates. Persistence, origin/tab binding, badge/popup effects,
 * and permission broadcasts remain in the injected domain functions.
 */

import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

export const BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES = [
  "getDappAccounts",
  "requestDappConnection",
  "getDappPermissions",
  "getDappConnectionContext",
  "getPendingDappConnectionRequests",
  "confirmDappConnection",
  "rejectDappConnection",
  "revokeDappPermission",
  "getEnsContenthashLastUpdated",
] as const;

export type BackgroundDappPermissionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  handleGetDappAccounts: (message: any, sender: chrome.runtime.MessageSender) => Promise<any>;
  handleRequestDappConnection: (
    message: any,
    sender: chrome.runtime.MessageSender,
  ) => Promise<void>;
  getDappPermissions: () => Promise<Record<string, unknown>>;
  handleGetDappConnectionContext: (tabId: number) => Promise<any>;
  getPendingDappConnectionRequests: () => Promise<any>;
  handleConfirmDappConnection: (requestId: string) => Promise<any>;
  handleRejectDappConnection: (requestId: string) => Promise<any>;
  handleRevokeDappPermission: (origin: string) => Promise<any>;
  getEnsContenthashLastUpdated: (ensName: unknown) => Promise<number | null>;
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  writeResultToStorage: (
    key: string,
    result: Record<string, unknown>,
  ) => Promise<void>;
};

const HANDLED_ASYNC: BackgroundDappPermissionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundDappPermissionRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundDappPermissionMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundDappPermissionRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "getDappAccounts": {
        dependencies.handleGetDappAccounts(message, sender).then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "requestDappConnection": {
        void dependencies
          .handleRequestDappConnection(message, sender)
          .catch((error) => {
            if (typeof message.requestId !== "string") return;
            void dependencies.writeResultToStorage(
              `dappConnectionResult:${message.requestId}`,
              {
                success: false,
                error: errorMessage(
                  error,
                  "Failed to queue connection request",
                ),
              },
            );
          });
        return HANDLED_SYNC;
      }

      case "getDappPermissions": {
        dependencies.getDappPermissions().then((permissions) =>
          sendResponse({
            success: true,
            permissions: Object.values(permissions),
          }),
        );
        return HANDLED_ASYNC;
      }

      case "getDappConnectionContext": {
        dependencies
          .handleGetDappConnectionContext(Number(message.tabId))
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getPendingDappConnectionRequests": {
        dependencies.getPendingDappConnectionRequests().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "confirmDappConnection":
      case "rejectDappConnection": {
        const confirming = message.type === "confirmDappConnection";
        dependencies
          .runPendingRequestResolution({
            family: "dappConnection",
            requestId: "all",
            action: confirming ? "confirm" : "reject",
            resolve: () =>
              confirming
                ? dependencies.handleConfirmDappConnection(
                    message.requestId || "",
                  )
                : dependencies.handleRejectDappConnection(
                    message.requestId || "",
                  ),
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                confirming
                  ? "Failed to confirm connection request"
                  : "Failed to reject connection request",
              ),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "revokeDappPermission": {
        dependencies
          .handleRevokeDappPermission(message.origin || "")
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getEnsContenthashLastUpdated": {
        dependencies
          .getEnsContenthashLastUpdated(message.ensName)
          .then((updatedAt) => sendResponse({ success: true, updatedAt }))
          .catch((error) => {
            const errorText = errorMessage(
              error,
              "ENS contenthash history lookup failed",
            );
            sendResponse({
              success: false,
              updatedAt: null,
              error: errorText,
            });
          });
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
