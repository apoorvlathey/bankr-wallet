import {
  deliverProviderRequestRejection,
  mapProviderRequestRejection,
} from "./providerRequestRejection";

export const PROVIDER_MESSAGES_BLOCKED_DURING_ERC7715 = new Set([
  "addEthereumChain",
  "dappChainSwitchNotification",
  "requestDappConnection",
  "rpcRequest",
  "sendTransaction",
  "signatureRequest",
  "walletExecutionPermissions",
  "walletGetCallsStatus",
  "walletGetCapabilities",
  "walletSendCalls",
  "walletShowCallsStatus",
  "watchAsset",
]);

export type BackgroundProviderIngressDependencies = {
  authorizeConnectedDappRequest: (
    sender: chrome.runtime.MessageSender,
  ) => Promise<any>;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  isErc7715PermissionRequestLocked: () => boolean;
  erc7715PermissionRequestInProgressError: string;
};

export function createBackgroundProviderIngressHelpers(
  dependencies: BackgroundProviderIngressDependencies,
): {
  connectedProviderOriginOrReject: (
    sender: chrome.runtime.MessageSender,
    resultPrefix: "txResult" | "sigResult",
    requestId: unknown,
  ) => Promise<string | null>;
  rejectExternalProviderRequest: (
    message: any,
    sendResponse: (response?: any) => void,
    error: string,
    code: number,
  ) => boolean;
  rejectExternalProviderRequestDuringErc7715Lock: (
    message: any,
    sendResponse: (response?: any) => void,
  ) => boolean;
} {
  const rejectExternalProviderRequest = (
    message: any,
    sendResponse: (response?: any) => void,
    error: string,
    code: number,
  ): boolean =>
    deliverProviderRequestRejection(
      mapProviderRequestRejection(message, error, code),
      { writeResult: dependencies.writeResultToStorage, sendResponse },
    );

  const connectedProviderOriginOrReject = async (
    sender: chrome.runtime.MessageSender,
    resultPrefix: "txResult" | "sigResult",
    requestId: unknown,
  ): Promise<string | null> => {
    if (
      typeof requestId !== "string" ||
      requestId.length === 0 ||
      requestId.length > 128
    ) {
      return null;
    }

    try {
      const authorization =
        await dependencies.authorizeConnectedDappRequest(sender);
      if (authorization.authorized) return authorization.origin;
      await dependencies.writeResultToStorage(`${resultPrefix}:${requestId}`, {
        success: false,
        error: authorization.error,
        code: authorization.code,
      });
    } catch {
      await dependencies.writeResultToStorage(`${resultPrefix}:${requestId}`, {
        success: false,
        error: "Unable to verify this site's WalletChan connection",
        code: 4100,
      });
    }
    return null;
  };

  const rejectExternalProviderRequestDuringErc7715Lock = (
    message: any,
    sendResponse: (response?: any) => void,
  ): boolean => {
    if (!PROVIDER_MESSAGES_BLOCKED_DURING_ERC7715.has(message.type)) return false;
    if (!dependencies.isErc7715PermissionRequestLocked()) return false;
    return rejectExternalProviderRequest(
      message,
      sendResponse,
      dependencies.erc7715PermissionRequestInProgressError,
      -32002,
    );
  };

  return {
    connectedProviderOriginOrReject,
    rejectExternalProviderRequest,
    rejectExternalProviderRequestDuringErc7715Lock,
  };
}
