/** Trusted-UI transport for single-transaction confirmation and transfer intake. */

import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

export const BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES = [
  "confirmTransaction",
  "confirmTransactionAsync",
  "confirmTransactionAsyncPK",
  "initiateTransfer",
] as const;

export type BackgroundTransactionExecutionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundTransactionExecutionDependencies = {
  getPendingTxRequestById: (txId: string) => Promise<any>;
  handleConfirmTransaction: (txId: string, password: string) => Promise<any>;
  handleConfirmTransactionAsync: (
    txId: string,
    password: string,
    functionName?: string,
    forceInclusion?: boolean,
  ) => Promise<any>;
  handleConfirmTransactionAsyncPK: (
    txId: string,
    password: string,
    tabId?: number,
    functionName?: string,
    gasOverrides?: any,
    forceInclusion?: boolean,
  ) => Promise<any>;
  handleInitiateTransfer: (message: any) => Promise<any>;
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  readLocalStorage: (key: string) => Promise<Record<string, unknown>>;
};

const HANDLED_ASYNC: BackgroundTransactionExecutionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createBackgroundTransactionExecutionMessageRouter(
  dependencies: BackgroundTransactionExecutionDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundTransactionExecutionRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "confirmTransaction": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "confirm",
            conflictResult: dependencies.pendingResolutionConflict,
            resolve: async () => {
              const pending = await dependencies.getPendingTxRequestById(txId);
              if (!pending) {
                return {
                  success: false,
                  error: "Transaction request not found",
                };
              }
              const result = await dependencies.handleConfirmTransaction(
                txId,
                message.password,
              );
              if (!(await dependencies.getPendingTxRequestById(txId))) {
                const resultKey = `txResult:${txId}`;
                const existingResult =
                  await dependencies.readLocalStorage(resultKey);
                if (!existingResult[resultKey]) {
                  await dependencies.writeResultToStorage(resultKey, result);
                }
              }
              return result;
            },
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to confirm transaction"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "confirmTransactionAsync": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "confirm",
            resolve: () =>
              dependencies.handleConfirmTransactionAsync(
                txId,
                message.password,
                message.functionName,
                message.forceInclusion,
              ),
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to confirm transaction"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "confirmTransactionAsyncPK": {
        const tabId = message.tabId || sender.tab?.id;
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "confirm",
            resolve: () =>
              dependencies.handleConfirmTransactionAsyncPK(
                txId,
                message.password,
                tabId,
                message.functionName,
                message.gasOverrides,
                message.forceInclusion,
              ),
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to confirm transaction"),
            }),
          );
        return HANDLED_ASYNC;
      }

      case "initiateTransfer": {
        dependencies.handleInitiateTransfer(message).then(sendResponse);
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
