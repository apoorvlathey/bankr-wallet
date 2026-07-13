/** Focused transport for EIP-747 intake and trusted-UI decisions. */

import type * as DappRequestPolicy from "../dappRequestPolicy";
import type * as MetadataPromptLifecycle from "../pendingMetadataPromptLifecycle";
import type * as PendingResolution from "../pendingRequestResolution";
import type * as WatchAssetStorage from "../pendingWatchAssetStorage";
import type * as SwapApi from "../swapApi";
import type * as CustomTokenStorage from "../customTokenStorage";
import type * as HiddenPortfolioTokens from "../hiddenPortfolioTokens";
import type { PendingWatchAssetRequest } from "../pendingWatchAssetStorage";

export const BACKGROUND_WATCH_ASSET_MESSAGE_TYPES = [
  "watchAsset",
  "getPendingWatchAssetRequests",
  "confirmWatchAsset",
  "rejectWatchAsset",
] as const;

export type BackgroundWatchAssetRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  authorizeConnectedDappRequest: typeof DappRequestPolicy.authorizeConnectedDappRequest;
  enforceMetadataPromptAuthorizationAtConfirmation: typeof MetadataPromptLifecycle.enforceMetadataPromptAuthorizationAtConfirmation;
  runPendingRequestResolution: typeof PendingResolution.runPendingRequestResolution;
  pendingResolutionConflict: (
    action: PendingResolution.PendingRequestResolutionAction,
  ) => { success: false; error: string };
  getPendingWatchAssetRequests: typeof WatchAssetStorage.getPendingWatchAssetRequests;
  savePendingWatchAssetRequest: typeof WatchAssetStorage.savePendingWatchAssetRequest;
  removePendingWatchAssetRequest: typeof WatchAssetStorage.removePendingWatchAssetRequest;
  fetchTokenInfo: typeof SwapApi.fetchTokenInfo;
  addCustomToken: typeof CustomTokenStorage.addCustomToken;
  unhidePortfolioToken: typeof HiddenPortfolioTokens.unhidePortfolioToken;
  writeResultToStorage: (
    key: string,
    result: Record<string, unknown>,
  ) => Promise<void>;
  openExtensionPopup: (senderWindowId?: number) => Promise<void>;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  now: () => number;
};

const HANDLED_ASYNC: BackgroundWatchAssetRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundWatchAssetRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundWatchAssetMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundWatchAssetRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "watchAsset": {
        const senderWindowId = sender.tab?.windowId;
        void (async () => {
          const authorization =
            await dependencies.authorizeConnectedDappRequest(sender);
          if (!authorization.authorized) {
            await dependencies.writeResultToStorage(
              `watchAssetResult:${message.watchAssetId}`,
              {
                success: false,
                error: authorization.error,
                code: authorization.code,
              },
            );
            return;
          }
          const request: PendingWatchAssetRequest = {
            id: message.watchAssetId,
            asset: message.asset,
            chainId: message.chainId,
            origin: authorization.origin,
            favicon: message.favicon || null,
            timestamp: dependencies.now(),
            tabId: authorization.tabId,
            frameId: sender.frameId,
            senderOrigin: authorization.origin,
          };
          await dependencies.savePendingWatchAssetRequest(request);
          void dependencies
            .sendRuntimeMessage({
              type: "newPendingWatchAssetRequest",
              request,
            })
            .catch(() => {});
          void dependencies.openExtensionPopup(senderWindowId);
        })().catch((error) => {
          void dependencies.writeResultToStorage(
            `watchAssetResult:${message.watchAssetId}`,
            {
              success: false,
              error: errorMessage(error, "Failed to queue asset request"),
            },
          );
        });
        return HANDLED_SYNC;
      }

      case "getPendingWatchAssetRequests": {
        dependencies.getPendingWatchAssetRequests().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "confirmWatchAsset": {
        dependencies
          .runPendingRequestResolution({
            family: "watchAsset",
            requestId: message.watchAssetId || "",
            action: "confirm",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending = (
                await dependencies.getPendingWatchAssetRequests()
              ).find((request) => request.id === message.watchAssetId);
              if (!pending) {
                return { success: false, error: "Asset request not found" };
              }
              let tokenName = pending.asset.symbol;
              try {
                const info = await dependencies.fetchTokenInfo(
                  pending.asset.address,
                  pending.chainId,
                );
                if (info?.name) tokenName = info.name;
              } catch {
                // The requested symbol remains the display-name fallback.
              }
              const authorization =
                await dependencies.enforceMetadataPromptAuthorizationAtConfirmation(
                  "watchAsset",
                  pending,
                );
              if (!authorization.authorized) {
                return { success: false, error: authorization.error };
              }
              await dependencies.addCustomToken({
                chainId: pending.chainId,
                contractAddress: pending.asset.address,
                symbol: pending.asset.symbol,
                name: tokenName,
                decimals: pending.asset.decimals,
                image: pending.asset.image,
              });
              await dependencies.unhidePortfolioToken(
                pending.chainId,
                pending.asset.address,
              );
              await dependencies.removePendingWatchAssetRequest(pending.id);
              await dependencies.writeResultToStorage(
                `watchAssetResult:${pending.id}`,
                { success: true },
              );
              return { success: true };
            },
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to add token"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "rejectWatchAsset": {
        dependencies
          .runPendingRequestResolution({
            family: "watchAsset",
            requestId: message.watchAssetId || "",
            action: "reject",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending = (
                await dependencies.getPendingWatchAssetRequests()
              ).find((request) => request.id === message.watchAssetId);
              if (!pending) {
                return { success: false, error: "Asset request not found" };
              }
              await dependencies.removePendingWatchAssetRequest(pending.id);
              await dependencies.writeResultToStorage(
                `watchAssetResult:${pending.id}`,
                {
                  success: false,
                  error: "User rejected token addition",
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
              error: errorMessage(error, "Failed to reject token"),
            }),
          );
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
