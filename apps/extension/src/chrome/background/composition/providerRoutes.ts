/** Provider RPC, metadata-prompt, and single signing-request route wiring. */

import { getActiveAccount } from "../../accountStorage";
import { addCustomToken } from "../../customTokenStorage";
import { authorizeConnectedDappRequest } from "../../dapp/requestPolicy";
import { addNetworkIfMissing } from "../../network/networkMutations";
import { assertRpcEndpointAllowedForOrigin } from "../../network/rpcClient";
import { handleSafeRpcRequest } from "../../network/safeRpcForwarding";
import { unhidePortfolioToken } from "../../portfolio/hiddenTokens";
import {
  enforceMetadataPromptAuthorizationAtConfirmation,
} from "../../requests/pendingMetadataPromptLifecycle";
import {
  getPendingAddChainRequests,
  removePendingAddChainRequest,
  savePendingAddChainRequest,
} from "../../requests/pendingAddChainStorage";
import {
  getPendingSignatureRequestById,
  getPendingSignatureRequests,
  removePendingSignatureRequest,
} from "../../requests/pendingSignatureStorage";
import {
  getPendingTxRequestById,
  getPendingTxRequests,
} from "../../requests/pendingTxStorage";
import {
  getPendingWatchAssetRequests,
  removePendingWatchAssetRequest,
  savePendingWatchAssetRequest,
} from "../../requests/pendingWatchAssetStorage";
import { fetchTokenInfo } from "../../swapApi";
import {
  handleCancelTransaction,
  handleRejectTransaction,
  handleTransactionRequest,
  openExtensionPopup,
  writeResultToStorage,
} from "../../txHandlers";
import { createBackgroundChainPromptMessageRouter } from "../chainPromptRouter";
import { createBackgroundProviderRpcMessageRouter } from "../providerRpcRouter";
import { createBackgroundSigningRequestMessageRouter } from "../signingRequestRouter";
import { createBackgroundWatchAssetMessageRouter } from "../watchAssetRouter";
import type { PendingResolutionComposition } from "./pendingResolution";
import type { ProviderContextComposition } from "./providerContext";

export function composeProviderRoutes(
  pending: PendingResolutionComposition,
  provider: ProviderContextComposition,
) {
  const routeBackgroundProviderRpcMessage =
    createBackgroundProviderRpcMessageRouter({
      authorizeConnectedDappRequest,
      handleSafeRpcRequest,
      writeResultToStorage,
    });

  const routeBackgroundWatchAssetMessage =
    createBackgroundWatchAssetMessageRouter({
      authorizeConnectedDappRequest,
      enforceMetadataPromptAuthorizationAtConfirmation,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      getPendingWatchAssetRequests,
      savePendingWatchAssetRequest,
      removePendingWatchAssetRequest,
      fetchTokenInfo,
      addCustomToken,
      unhidePortfolioToken,
      writeResultToStorage,
      openExtensionPopup,
      sendRuntimeMessage: (runtimeMessage) =>
        chrome.runtime.sendMessage(runtimeMessage),
      now: Date.now,
    });

  const routeBackgroundChainPromptMessage =
    createBackgroundChainPromptMessageRouter({
      authorizeConnectedDappRequest,
      enforceMetadataPromptAuthorizationAtConfirmation,
      assertRpcEndpointAllowedForOrigin,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      getPendingAddChainRequests,
      savePendingAddChainRequest,
      removePendingAddChainRequest,
      getActiveAccount,
      addNetworkIfMissing,
      writeResultToStorage,
      openExtensionPopup,
      sendRuntimeMessage: (runtimeMessage) =>
        chrome.runtime.sendMessage(runtimeMessage),
      handleDappChainSwitchNotification:
        provider.handleDappChainSwitchNotification,
      now: Date.now,
    });

  const routeBackgroundSigningRequestMessage =
    createBackgroundSigningRequestMessageRouter({
      connectedProviderOriginOrReject: provider.connectedProviderOriginOrReject,
      handleTransactionRequest,
      enqueueAuthorizedSignatureRequest:
        provider.enqueueAuthorizedSignatureRequest,
      getPendingSignatureRequests,
      getPendingSignatureRequestById,
      removePendingSignatureRequest,
      getPendingTxRequests,
      getPendingTxRequestById,
      handleRejectTransaction,
      handleCancelTransaction,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      pendingRequestResolutionAction: pending.pendingRequestResolutionAction,
      canSignalPendingTransactionCancellation:
        pending.canSignalPendingTransactionCancellation,
      writeResultToStorage,
    });

  return {
    routeBackgroundProviderRpcMessage,
    routeBackgroundWatchAssetMessage,
    routeBackgroundChainPromptMessage,
    routeBackgroundSigningRequestMessage,
  };
}
