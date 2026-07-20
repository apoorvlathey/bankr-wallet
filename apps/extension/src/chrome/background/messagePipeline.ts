/** Ordered main-listener policy and transport delegation pipeline. */

import { handleEnsBrowsingMessage } from "../ensBrowsing";
import { validateExternalProviderMessage } from "../provider/messageValidation";
import { isTrustedWalletUiSender } from "../trustedWalletUiSender";
import { classifyBackgroundMessage } from "./messageAccessPolicy";
import type { BackgroundRouteComposition } from "./composition/routes";

export function createBackgroundMessagePipeline(
  routes: BackgroundRouteComposition,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => boolean {
  return (message, sender, sendResponse) => {
    // ENS browsing owns its interstitial/banner/settings messages before the
    // wallet/provider audience gate and falls through for everything else.
    if (handleEnsBrowsingMessage(message, sender, sendResponse)) {
      return true;
    }

    const trustedWalletUi = isTrustedWalletUiSender(sender);
    const audience = classifyBackgroundMessage(message?.type);

    if (!trustedWalletUi && audience !== "provider") {
      sendResponse({ success: false, error: "Unauthorized" });
      return false;
    }

    if (!trustedWalletUi) {
      const validation = validateExternalProviderMessage(message);
      if (!validation.valid) {
        routes.rejectExternalProviderRequest(
          message,
          sendResponse,
          validation.error || "Invalid provider request",
          -32602,
        );
        return false;
      }
    }

    if (
      !trustedWalletUi &&
      routes.rejectExternalProviderRequestDuringErc7715Lock(
        message,
        sendResponse,
      )
    ) {
      return false;
    }

    const authRoute = routes.routeBackgroundAuthMessage(message, sendResponse);
    if (authRoute.handled) return authRoute.keepChannelOpen;

    const bankrCredentialRoute =
      routes.routeBackgroundBankrCredentialMessage(
        message,
        sender,
        sendResponse,
      );
    if (bankrCredentialRoute.handled) {
      return bankrCredentialRoute.keepChannelOpen;
    }

    const onboardingRoute = routes.routeBackgroundOnboardingMessage(
      message,
      sendResponse,
    );
    if (onboardingRoute.handled) return onboardingRoute.keepChannelOpen;

    const accountStateRoute = routes.routeBackgroundAccountStateMessage(
      message,
      sender,
      sendResponse,
    );
    if (accountStateRoute.handled) return accountStateRoute.keepChannelOpen;

    const contactBookRoute = routes.routeBackgroundContactBookMessage(
      message,
      sendResponse,
    );
    if (contactBookRoute.handled) return contactBookRoute.keepChannelOpen;

    const settingsRoute = routes.routeBackgroundSettingsMessage(
      message,
      sendResponse,
    );
    if (settingsRoute.handled) return settingsRoute.keepChannelOpen;

    const dappPermissionRoute =
      routes.routeBackgroundDappPermissionMessage(
        message,
        sender,
        sendResponse,
      );
    if (dappPermissionRoute.handled) {
      return dappPermissionRoute.keepChannelOpen;
    }

    const providerRpcRoute = routes.routeBackgroundProviderRpcMessage(
      message,
      sender,
    );
    if (providerRpcRoute.handled) return providerRpcRoute.keepChannelOpen;

    const walletConnectSessionRoute =
      routes.routeBackgroundWalletConnectSessionMessage(message, sendResponse);
    if (walletConnectSessionRoute.handled) {
      return walletConnectSessionRoute.keepChannelOpen;
    }

    const watchAssetRoute = routes.routeBackgroundWatchAssetMessage(
      message,
      sender,
      sendResponse,
    );
    if (watchAssetRoute.handled) return watchAssetRoute.keepChannelOpen;

    const chainPromptRoute = routes.routeBackgroundChainPromptMessage(
      message,
      sender,
      sendResponse,
    );
    if (chainPromptRoute.handled) return chainPromptRoute.keepChannelOpen;

    const signingRequestRoute =
      routes.routeBackgroundSigningRequestMessage(
        message,
        sender,
        sendResponse,
      );
    if (signingRequestRoute.handled) {
      return signingRequestRoute.keepChannelOpen;
    }

    const transactionExecutionRoute =
      routes.routeBackgroundTransactionExecutionMessage(
        message,
        sender,
        sendResponse,
      );
    if (transactionExecutionRoute.handled) {
      return transactionExecutionRoute.keepChannelOpen;
    }

    const swapExecutionRoute = routes.routeBackgroundSwapExecutionMessage(
      message,
      sendResponse,
    );
    if (swapExecutionRoute.handled) {
      return swapExecutionRoute.keepChannelOpen;
    }

    const sponsoredTransferRoute =
      routes.routeBackgroundSponsoredTransferMessage(message, sendResponse);
    if (sponsoredTransferRoute.handled) {
      return sponsoredTransferRoute.keepChannelOpen;
    }

    const transactionStatusRoute =
      routes.routeBackgroundTransactionStatusMessage(message, sendResponse);
    if (transactionStatusRoute.handled) {
      return transactionStatusRoute.keepChannelOpen;
    }

    const accountManagementRoute =
      routes.routeBackgroundAccountManagementMessage(
        message,
        sender,
        sendResponse,
      );
    if (accountManagementRoute.handled) {
      return accountManagementRoute.keepChannelOpen;
    }

    const ledgerRoute = routes.routeBackgroundLedgerMessage(
      message,
      sendResponse,
    );
    if (ledgerRoute.handled) return ledgerRoute.keepChannelOpen;

    const safeAccountRoute = routes.routeBackgroundSafeAccountMessage(
      message,
      sender,
      sendResponse,
    );
    if (safeAccountRoute.handled) return safeAccountRoute.keepChannelOpen;

    const safeProposalRoute = routes.routeBackgroundSafeProposalMessage(
      message,
      sender,
      sendResponse,
    );
    if (safeProposalRoute.handled) return safeProposalRoute.keepChannelOpen;

    const secretManagementRoute =
      routes.routeBackgroundSecretManagementMessage(
        message,
        sender,
        sendResponse,
      );
    if (secretManagementRoute.handled) {
      return secretManagementRoute.keepChannelOpen;
    }

    const batchRequestRoute = routes.routeBackgroundBatchRequestMessage(
      message,
      sender,
      sendResponse,
    );
    if (batchRequestRoute.handled) {
      return batchRequestRoute.keepChannelOpen;
    }

    const delegationRoute = routes.routeBackgroundDelegationMessage(
      message,
      sendResponse,
    );
    if (delegationRoute.handled) return delegationRoute.keepChannelOpen;

    const crossDappBatchRoute =
      routes.routeBackgroundCrossDappBatchMessage(message, sendResponse);
    if (crossDappBatchRoute.handled) {
      return crossDappBatchRoute.keepChannelOpen;
    }

    const erc7715PermissionRoute =
      routes.routeBackgroundErc7715PermissionMessage(
        message,
        sender,
        sendResponse,
      );
    if (erc7715PermissionRoute.handled) {
      return erc7715PermissionRoute.keepChannelOpen;
    }

    const gasSimulationRoute =
      routes.routeBackgroundGasSimulationMessage(message, sendResponse);
    if (gasSimulationRoute.handled) {
      return gasSimulationRoute.keepChannelOpen;
    }

    const swapBridgeDataRoute =
      routes.routeBackgroundSwapBridgeDataMessage(message, sendResponse);
    if (swapBridgeDataRoute.handled) {
      return swapBridgeDataRoute.keepChannelOpen;
    }

    const tokenDataRoute = routes.routeBackgroundTokenDataMessage(
      message,
      sender,
      sendResponse,
    );
    if (tokenDataRoute.handled) return tokenDataRoute.keepChannelOpen;

    const chatRoute = routes.routeBackgroundChatMessage(message, sendResponse);
    if (chatRoute.handled) return chatRoute.keepChannelOpen;

    const clearSigningRoute = routes.routeBackgroundClearSigningMessage(
      message,
      sendResponse,
    );
    if (clearSigningRoute.handled) return clearSigningRoute.keepChannelOpen;

    const resetRoute = routes.routeBackgroundResetMessage(
      message,
      sendResponse,
    );
    if (resetRoute.handled) return resetRoute.keepChannelOpen;

    if (message.type && typeof message.type === "string") {
      console.warn(`[WalletChan] Unknown message type: ${message.type}`);
    }
    return false;
  };
}
