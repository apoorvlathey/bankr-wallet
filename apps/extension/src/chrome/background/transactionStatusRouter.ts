/** Trusted-UI transport for transaction history, processing, and receipt state. */

export const BACKGROUND_TRANSACTION_STATUS_MESSAGE_TYPES = [
  "cancelProcessingTx",
  "getFailedTxResult",
  "clearFailedTxResult",
  "getTxHistory",
  "getTxHistoryPage",
  "getTxHistoryItem",
  "getTransactionCalldata",
  "resolveHistoryNftMetadata",
  "backfillAssetChanges",
  "getProcessingTxs",
  "clearTxHistory",
  "clearTxHistoryForAddresses",
  "clearNonceCache",
  "checkPendingTxReceipt",
  "getArbitrumForceInclusionStatus",
  "submitArbitrumForceInclusion",
] as const;

export type BackgroundTransactionStatusRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  handleCancelProcessingTx: (txId: string) => Promise<any>;
  failedTxResults: Map<string, any>;
  removeLocalStorage: (key: string) => void;
  getTxHistory: () => Promise<any>;
  getTxHistoryPage: (options: any) => Promise<any>;
  getTxHistoryItem: (txId: string) => Promise<any>;
  getTransactionCalldata: (txId: string) => Promise<any>;
  resolveHistoryNftMetadata: (options: any) => Promise<any>;
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
  getArbitrumForceInclusionStatus: (txId: string) => Promise<any>;
  submitArbitrumForceInclusion: (txId: string) => Promise<any>;
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

      case "getTxHistoryPage": {
        dependencies.getTxHistoryPage({
          ownerAddress:
            typeof message.ownerAddress === "string" ? message.ownerAddress : undefined,
          chainId: Number.isSafeInteger(message.chainId) ? message.chainId : null,
          cursor: message.cursor ?? null,
          limit: Number.isSafeInteger(message.limit) ? message.limit : undefined,
        }).then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getTxHistoryItem": {
        dependencies.getTxHistoryItem(String(message.txId || "")).then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "getTransactionCalldata": {
        dependencies.getTransactionCalldata(String(message.txId || "")).then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "resolveHistoryNftMetadata": {
        dependencies.resolveHistoryNftMetadata({
          txId: String(message.txId || ""),
          leg: message.leg === "destination" ? "destination" : "source",
          nftIndex: Number.isSafeInteger(message.nftIndex) ? message.nftIndex : -1,
        }).then(sendResponse);
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

      case "getArbitrumForceInclusionStatus": {
        dependencies
          .getArbitrumForceInclusionStatus(String(message.txId || ""))
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "submitArbitrumForceInclusion": {
        dependencies
          .submitArbitrumForceInclusion(String(message.txId || ""))
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
