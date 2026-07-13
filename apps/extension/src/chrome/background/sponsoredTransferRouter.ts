/** Trusted-UI transport for sponsored submission and durable recovery state. */

export const BACKGROUND_SPONSORED_TRANSFER_MESSAGE_TYPES = [
  "sponsoredTransfer",
  "checkSponsoredTransferStatus",
  "acknowledgeSponsoredTransfer",
  "checkPremiumStatus",
] as const;

export type BackgroundSponsoredTransferRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundSponsoredTransferDependencies = {
  runInternalIrreversibleOperation: <T>(
    resolve: () => Promise<T>,
  ) => Promise<T>;
  handleSponsoredTransfer: (message: any) => Promise<any>;
  handleCheckSponsoredTransferStatus: (fromAddress: string) => Promise<any>;
  handleAcknowledgeSponsoredTransfer: (
    intentId: string,
    fromAddress: string,
  ) => Promise<any>;
  handleCheckPremiumStatus: (address: string) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundSponsoredTransferRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function createBackgroundSponsoredTransferMessageRouter(
  dependencies: BackgroundSponsoredTransferDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundSponsoredTransferRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "sponsoredTransfer":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleSponsoredTransfer(message),
          )
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Sponsored transfer failed",
            }),
          );
        return HANDLED_ASYNC;

      case "checkSponsoredTransferStatus":
        dependencies
          .handleCheckSponsoredTransferStatus(message.fromAddress)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              hasUnresolved: true,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not check sponsored transfer status",
            }),
          );
        return HANDLED_ASYNC;

      case "acknowledgeSponsoredTransfer":
        dependencies
          .handleAcknowledgeSponsoredTransfer(
            message.intentId,
            message.fromAddress,
          )
          .then(sendResponse)
          .catch(() => sendResponse({ success: false }));
        return HANDLED_ASYNC;

      case "checkPremiumStatus":
        dependencies.handleCheckPremiumStatus(message.address).then(sendResponse);
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
