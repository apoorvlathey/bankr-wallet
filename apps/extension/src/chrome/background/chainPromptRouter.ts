/** Focused transport for EIP-3085 prompts and connected-site chain notices. */

import type * as AccountStorage from "../accountStorage";
import type * as DappRequestPolicy from "../dappRequestPolicy";
import type * as MetadataPromptLifecycle from "../pendingMetadataPromptLifecycle";
import type * as NetworkStorage from "../networkStorage";
import type * as PendingAddChainStorage from "../pendingAddChainStorage";
import type * as PendingResolution from "../pendingRequestResolution";
import type * as RpcHttpClient from "../rpcHttpClient";
import type { PendingAddChainRequest } from "../pendingAddChainStorage";

export const BACKGROUND_CHAIN_PROMPT_MESSAGE_TYPES = [
  "addEthereumChain",
  "getPendingAddChainRequests",
  "confirmAddChain",
  "rejectAddChain",
  "dappChainSwitchNotification",
] as const;

export type BackgroundChainPromptRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  authorizeConnectedDappRequest: typeof DappRequestPolicy.authorizeConnectedDappRequest;
  enforceMetadataPromptAuthorizationAtConfirmation: typeof MetadataPromptLifecycle.enforceMetadataPromptAuthorizationAtConfirmation;
  assertRpcEndpointAllowedForOrigin: typeof RpcHttpClient.assertRpcEndpointAllowedForOrigin;
  runPendingRequestResolution: typeof PendingResolution.runPendingRequestResolution;
  pendingResolutionConflict: (
    action: PendingResolution.PendingRequestResolutionAction,
  ) => { success: false; error: string };
  getPendingAddChainRequests: typeof PendingAddChainStorage.getPendingAddChainRequests;
  savePendingAddChainRequest: typeof PendingAddChainStorage.savePendingAddChainRequest;
  removePendingAddChainRequest: typeof PendingAddChainStorage.removePendingAddChainRequest;
  getActiveAccount: typeof AccountStorage.getActiveAccount;
  addNetworkIfMissing: typeof NetworkStorage.addNetworkIfMissing;
  writeResultToStorage: (
    key: string,
    result: Record<string, unknown>,
  ) => Promise<void>;
  openExtensionPopup: (senderWindowId?: number) => Promise<void>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  handleDappChainSwitchNotification: (
    message: any,
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  now: () => number;
};

const HANDLED_ASYNC: BackgroundChainPromptRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundChainPromptRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundChainPromptMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundChainPromptRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "addEthereumChain": {
        const senderWindowId = sender.tab?.windowId;
        void (async () => {
          const authorization =
            await dependencies.authorizeConnectedDappRequest(sender);
          if (!authorization.authorized) {
            await dependencies.writeResultToStorage(
              `addChainResult:${message.requestId}`,
              {
                success: false,
                error: authorization.error,
                code: authorization.code,
              },
            );
            return;
          }
          for (const rpcUrl of message.rpcUrls || []) {
            dependencies.assertRpcEndpointAllowedForOrigin(
              rpcUrl,
              authorization.origin,
            );
          }
          const request: PendingAddChainRequest = {
            id: message.requestId,
            chainId: message.chainId,
            chainName: message.chainName,
            nativeCurrency: message.nativeCurrency,
            rpcUrls: message.rpcUrls,
            blockExplorerUrls: message.blockExplorerUrls,
            origin: authorization.origin,
            favicon: message.favicon || null,
            timestamp: dependencies.now(),
            tabId: authorization.tabId,
            frameId: sender.frameId,
            senderOrigin: authorization.origin,
          };
          await dependencies.savePendingAddChainRequest(request);
          void dependencies
            .sendRuntimeMessage({ type: "newPendingAddChainRequest", request })
            .catch(() => {});
          void dependencies.openExtensionPopup(senderWindowId);
        })().catch((error) => {
          void dependencies.writeResultToStorage(
            `addChainResult:${message.requestId}`,
            {
              success: false,
              error: errorMessage(error, "Failed to queue chain request"),
            },
          );
        });
        return HANDLED_SYNC;
      }

      case "getPendingAddChainRequests": {
        dependencies.getPendingAddChainRequests().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "confirmAddChain": {
        dependencies
          .runPendingRequestResolution({
            family: "addChain",
            requestId: message.requestId || "",
            action: "confirm",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending = (
                await dependencies.getPendingAddChainRequests()
              ).find((request) => request.id === message.requestId);
              if (!pending) {
                return {
                  success: false,
                  error: "Pending add-chain request not found",
                };
              }
              const name =
                message.chainName ||
                pending.chainName ||
                `Chain ${pending.chainId}`;
              const rpcUrl = message.rpcUrl || pending.rpcUrls?.[0] || "";
              const explorer =
                message.explorer || pending.blockExplorerUrls?.[0] || "";
              const nativeCurrency =
                message.nativeCurrency || pending.nativeCurrency;
              const activeAccount = await dependencies.getActiveAccount();
              const authorization =
                await dependencies.enforceMetadataPromptAuthorizationAtConfirmation(
                  "addChain",
                  pending,
                );
              if (!authorization.authorized) {
                return { success: false, error: authorization.error };
              }
              const addResult = await dependencies.addNetworkIfMissing({
                chainName: name,
                entry: {
                  chainId: message.chainId || pending.chainId,
                  rpcUrl,
                  isCustom: true,
                  explorer: explorer || undefined,
                  nativeCurrency,
                },
                switchIfSupportedForAccountType: activeAccount?.type ?? null,
                requestOrigin: pending.origin,
              });
              if (!addResult.success) return addResult;

              await dependencies.removePendingAddChainRequest(pending.id);
              const result = {
                success: true,
                rpcUrl:
                  addResult.networksInfo[addResult.chainName]?.rpcUrl || rpcUrl,
                chainName: addResult.chainName,
                shouldSwitch: addResult.shouldSwitch,
              };
              await dependencies.writeResultToStorage(
                `addChainResult:${pending.id}`,
                result,
              );
              return result;
            },
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to add network"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "rejectAddChain": {
        dependencies
          .runPendingRequestResolution({
            family: "addChain",
            requestId: message.requestId || "",
            action: "reject",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending = (
                await dependencies.getPendingAddChainRequests()
              ).find((request) => request.id === message.requestId);
              if (!pending) {
                return { success: false, error: "Chain request not found" };
              }
              await dependencies.removePendingAddChainRequest(pending.id);
              await dependencies.writeResultToStorage(
                `addChainResult:${pending.id}`,
                {
                  success: false,
                  error: "User rejected chain addition",
                  code: 4001,
                },
              );
              return { success: true };
            },
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to reject network"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "dappChainSwitchNotification": {
        void (async () => {
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
          sendResponse(
            await dependencies.handleDappChainSwitchNotification(
              message,
              sender,
            ),
          );
        })().catch((error) =>
          sendResponse({
            success: false,
            error: errorMessage(error, "Failed to show notification"),
          }),
        );
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
