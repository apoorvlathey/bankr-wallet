/** Trusted-UI transport for transaction history, processing, and receipt state. */

export const BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES = [
  "cancelProcessingTx",
  "getFailedTxResult",
  "clearFailedTxResult",
  "getTxHistory",
  "backfillAssetChanges",
  "getProcessingTxs",
  "clearTxHistory",
  "clearTxHistoryForAddresses",
  "clearNonceCache",
  "checkPendingTxReceipt",
] as const;

export type BackgroundTransactionStatusRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  handleCancelProcessingTx: (txId: string) => Promise<any>;
  failedTxResults: Map<string, any>;
  removeLocalStorage: (key: string) => void;
  getTxHistory: () => Promise<any>;
  queueAssetChangesBackfill: (txId: string) => Promise<any>;
  getProcessingTxs: () => Promise<any>;
  clearTxHistory: () => Promise<void>;
  clearTxHistoryForAddresses: (addresses: string[]) => Promise<void>;
  clearAllNonces: () => void;
  checkPendingTxReceipt: (
    txId: string,
    txHash: string,
    chainId: number,
  ) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundTransactionStatusRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundTransactionStatusRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

export function createBackgroundTransactionStatusMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundTransactionStatusRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "cancelProcessingTx": {
        dependencies.handleCancelProcessingTx(message.txId).then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getFailedTxResult": {
        const result = dependencies.failedTxResults.get(message.notificationId);
        if (result) {
          dependencies.failedTxResults.delete(message.notificationId);
          dependencies.removeLocalStorage(
            `notification-${message.notificationId}`,
          );
        }
        sendResponse(result || null);
        return HANDLED_SYNC;
      }

      case "clearFailedTxResult": {
        dependencies.failedTxResults.delete(message.notificationId);
        dependencies.removeLocalStorage(`notification-${message.notificationId}`);
        sendResponse({ success: true });
        return HANDLED_SYNC;
      }

      case "getTxHistory": {
        dependencies.getTxHistory().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "backfillAssetChanges": {
        dependencies
          .queueAssetChangesBackfill(String(message.txId || ""))
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getProcessingTxs": {
        dependencies.getProcessingTxs().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "clearTxHistory": {
        dependencies.clearTxHistory().then(() => {
          sendResponse({ success: true });
        });
        return HANDLED_ASYNC;
      }

      case "clearTxHistoryForAddresses": {
        const addresses = Array.isArray(message.addresses)
          ? (message.addresses as unknown[]).filter(
              (address): address is string => typeof address === "string",
            )
          : [];
        dependencies.clearTxHistoryForAddresses(addresses).then(() => {
          sendResponse({ success: true });
        });
        return HANDLED_ASYNC;
      }

      case "clearNonceCache": {
        dependencies.clearAllNonces();
        sendResponse({ success: true });
        return HANDLED_SYNC;
      }

      case "checkPendingTxReceipt": {
        dependencies
          .checkPendingTxReceipt(
            message.txId,
            message.txHash,
            message.chainId,
          )
          .then((result) => {
            sendResponse({ status: result });
          });
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
