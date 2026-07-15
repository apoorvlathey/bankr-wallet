/**
 * Transport for pending single-transaction and signature requests.
 *
 * The composition root has already enforced the message audience and external
 * provider envelope before this router runs. Domain authorization, request
 * persistence, signing, and publication remain injected dependencies.
 */

import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";
import type { ProviderRequestSurfaceType } from "../windowing/providerRequestSurface";

export const BACKGROUND_SIGNING_REQUEST_MESSAGE_TYPES = [
  "openProviderRequestSidePanel",
  "getProviderRequestSurfaceHint",
  "sendTransaction",
  "signatureRequest",
  "getPendingSignatureRequests",
  "rejectSignatureRequest",
  "getPendingTxRequests",
  "getPendingTransaction",
  "rejectTransaction",
  "cancelTransaction",
] as const;

export type BackgroundSigningRequestRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  openProviderRequestSidePanel: (
    sender: chrome.runtime.MessageSender,
    requestType: ProviderRequestSurfaceType,
  ) => void;
  takeProviderRequestSurfaceHint: (windowId: number) => unknown;
  connectedProviderOriginOrReject: (
    sender: chrome.runtime.MessageSender,
    resultPrefix: "txResult" | "sigResult",
    requestId: unknown,
  ) => Promise<string | null>;
  handleTransactionRequest: (
    message: any,
    txId: string,
    senderWindowId: number | undefined,
    trustedOrigin: string,
    tabId: number | undefined,
    frameId: number | undefined,
  ) => void;
  enqueueAuthorizedSignatureRequest: (
    message: any,
    sender: chrome.runtime.MessageSender,
    trustedOrigin: string,
  ) => void;
  getPendingSignatureRequests: () => Promise<any>;
  getPendingSignatureRequestById: (sigId: string) => Promise<any>;
  removePendingSignatureRequest: (sigId: string) => Promise<void>;
  getPendingTxRequests: () => Promise<any>;
  getPendingTxRequestById: (txId: string) => Promise<any>;
  handleRejectTransaction: (txId: string) => Promise<any>;
  handleCancelTransaction: (txId: string) => Promise<any>;
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  pendingRequestResolutionAction: (
    family: "transaction",
    requestId: string,
  ) => any;
  canSignalPendingTransactionCancellation: (requestId: string) => boolean;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
};

const HANDLED_ASYNC: BackgroundSigningRequestRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundSigningRequestRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundSigningRequestMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundSigningRequestRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "openProviderRequestSidePanel": {
        dependencies.openProviderRequestSidePanel(
          sender,
          message.requestType as ProviderRequestSurfaceType,
        );
        return HANDLED_SYNC;
      }

      case "getProviderRequestSurfaceHint": {
        const windowId = message.windowId;
        sendResponse(
          Number.isSafeInteger(windowId) && windowId >= 0
            ? dependencies.takeProviderRequestSurfaceHint(windowId)
            : null,
        );
        return HANDLED_SYNC;
      }

      case "sendTransaction": {
        const senderWindowId = sender.tab?.windowId;
        void dependencies
          .connectedProviderOriginOrReject(sender, "txResult", message.txId)
          .then((trustedOrigin) => {
            if (!trustedOrigin) return;
            dependencies.handleTransactionRequest(
              message,
              message.txId,
              senderWindowId,
              trustedOrigin,
              sender.tab?.id,
              sender.frameId,
            );
          });
        return HANDLED_SYNC;
      }

      case "signatureRequest": {
        void dependencies
          .connectedProviderOriginOrReject(sender, "sigResult", message.sigId)
          .then((trustedOrigin) => {
            if (!trustedOrigin) return;
            dependencies.enqueueAuthorizedSignatureRequest(
              message,
              sender,
              trustedOrigin,
            );
          });
        return HANDLED_SYNC;
      }

      case "getPendingSignatureRequests": {
        dependencies.getPendingSignatureRequests().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "rejectSignatureRequest": {
        const sigId = typeof message.sigId === "string" ? message.sigId : "";
        dependencies
          .runPendingRequestResolution({
            family: "signature",
            requestId: sigId,
            action: "reject",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending =
                await dependencies.getPendingSignatureRequestById(sigId);
              if (!pending) {
                return {
                  success: false,
                  error: "Signature request not found",
                };
              }
              const result = {
                success: false,
                error: "Signature request cancelled by user",
              };
              await dependencies.removePendingSignatureRequest(sigId);
              await dependencies.writeResultToStorage(
                `sigResult:${sigId}`,
                result,
              );
              return result;
            },
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                "Failed to reject signature request",
              ),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "getPendingTxRequests": {
        dependencies.getPendingTxRequests().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getPendingTransaction": {
        void dependencies
          .getPendingTxRequestById(message.txId)
          .then((request) => {
            if (!request) {
              sendResponse(null);
              return;
            }
            sendResponse({
              tx: request.tx,
              origin: request.origin,
              chainName: request.chainName,
              favicon: request.favicon,
            });
          });
        return HANDLED_ASYNC;
      }

      case "rejectTransaction": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "reject",
            resolve: () => dependencies.handleRejectTransaction(txId),
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to reject transaction"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "cancelTransaction": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        if (!dependencies.canSignalPendingTransactionCancellation(txId)) {
          sendResponse(
            dependencies.pendingResolutionConflict(
              dependencies.pendingRequestResolutionAction(
                "transaction",
                txId,
              ) || "cancel",
            ),
          );
          return HANDLED_ASYNC;
        }
        dependencies.handleCancelTransaction(message.txId).then(sendResponse);
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
