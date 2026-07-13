/**
 * Focused transport for injected dapp requests and trusted-UI permission
 * management. It runs only after the composition root's audience, sender, and
 * provider-envelope gates. Persistence, origin/tab binding, badge/popup effects,
 * and permission broadcasts remain in the injected domain functions.
 */

import type * as PendingRequestResolutionModule from "../pendingRequestResolution";

export const BACKGROUND_DAPP_PERMISSION_MESSAGE_TYPES = [
  "getDappAccounts",
  "requestDappConnection",
  "expireProviderRequest",
  "getDappPermissions",
  "getDappConnectionContext",
  "getPendingDappConnectionRequests",
  "confirmDappConnection",
  "rejectDappConnection",
  "revokeDappPermission",
] as const;

export type BackgroundDappPermissionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type ProviderRequestKind =
  | "transaction"
  | "signature"
  | "dappConnection"
  | "erc7715Permission"
  | "addChain"
  | "watchAsset"
  | "batchTransaction";

type Dependencies = {
  handleGetDappAccounts: (sender: chrome.runtime.MessageSender) => Promise<any>;
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
  expireDappConnectionRequest: (
    requestId: string,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  expireErc7715PermissionRequest: (
    requestId: string,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  expireBatchAcknowledgement: (
    requestId: string,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  expireMetadataPrompt: (
    kind: "addChain" | "watchAsset",
    requestId: string,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  expireInjectedProviderRequest: (
    kind: "transaction" | "signature",
    requestId: string,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
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

function isProviderRequestKind(value: unknown): value is ProviderRequestKind {
  return (
    value === "transaction" ||
    value === "signature" ||
    value === "dappConnection" ||
    value === "erc7715Permission" ||
    value === "addChain" ||
    value === "watchAsset" ||
    value === "batchTransaction"
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function expireProviderRequest(
  dependencies: Dependencies,
  kind: ProviderRequestKind,
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<any> {
  if (kind === "dappConnection") {
    return dependencies.expireDappConnectionRequest(requestId, sender);
  }
  if (kind === "erc7715Permission") {
    return dependencies.expireErc7715PermissionRequest(requestId, sender);
  }
  if (kind === "batchTransaction") {
    return dependencies.expireBatchAcknowledgement(requestId, sender);
  }
  if (kind === "addChain" || kind === "watchAsset") {
    return dependencies.expireMetadataPrompt(kind, requestId, sender);
  }
  return dependencies.expireInjectedProviderRequest(kind, requestId, sender);
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
        dependencies.handleGetDappAccounts(sender).then(sendResponse);
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

      case "expireProviderRequest": {
        if (
          !isProviderRequestKind(message.requestKind) ||
          typeof message.requestId !== "string"
        ) {
          sendResponse({ success: false, error: "Invalid provider request" });
          return HANDLED_SYNC;
        }
        expireProviderRequest(
          dependencies,
          message.requestKind,
          message.requestId,
          sender,
        )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to expire provider request"),
            }),
          );
        return HANDLED_ASYNC;
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

      default:
        return { handled: false };
    }
  };
}
