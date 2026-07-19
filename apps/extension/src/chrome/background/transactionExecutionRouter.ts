/** Trusted-UI transport for single-transaction confirmation and transfer intake. */

import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

export const BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES = [
  "confirmTransaction",
  "confirmTransactionAsync",
  "confirmTransactionAsyncPK",
  "confirmTransactionAsyncLedger",
  "getFeePaymentOptions",
  "prepareFeePaymentQuote",
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
    feePaymentToken?: "native" | "token",
    feePaymentQuoteId?: string,
  ) => Promise<any>;
  handleConfirmTransactionAsyncPK: (
    txId: string,
    password: string,
    tabId?: number,
    functionName?: string,
    gasOverrides?: any,
    forceInclusion?: boolean,
    feePaymentToken?: "native" | "token",
    feePaymentQuoteId?: string,
  ) => Promise<any>;
  handleConfirmTransactionAsyncLedger: (
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
  getFeePaymentOptions: (txId: string) => Promise<any>;
  getBatchFeePaymentOptions: (bundleId: string) => Promise<any>;
  prepareFeePaymentQuote: (
    family: "transaction" | "batchTransaction",
    requestId: string,
    tokenId: unknown,
  ) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundTransactionExecutionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function feePaymentToken(value: unknown): "native" | "token" {
  if (value === undefined || value === "native") return "native";
  if (value === "token") return "token";
  throw new Error("Invalid gas-payment token");
}

function validatedFeePaymentToken(
  value: unknown,
  forceInclusion: unknown,
): "native" | "token" {
  const token = feePaymentToken(value);
  if (token === "token" && forceInclusion === true) {
    throw new Error("Force inclusion requires native gas payment");
  }
  return token;
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
      case "getFeePaymentOptions": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        const query = message.requestKind === "batch"
          ? dependencies.getBatchFeePaymentOptions(txId)
          : dependencies.getFeePaymentOptions(txId);
        query.then(sendResponse).catch((error) =>
          sendResponse({
            success: false,
            error: errorMessage(error, "Failed to load gas-payment options"),
          }),
        );
        return HANDLED_ASYNC;
      }

      case "prepareFeePaymentQuote": {
        const requestId =
          typeof message.requestId === "string" ? message.requestId : "";
        const family = message.requestKind === "batch"
          ? "batchTransaction"
          : "transaction";
        dependencies.prepareFeePaymentQuote(family, requestId, message.feePaymentToken)
          .then(sendResponse)
          .catch((error) => sendResponse({
            success: false,
            error: errorMessage(error, "Failed to prepare fee-token quote"),
          }));
        return HANDLED_ASYNC;
      }

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
                validatedFeePaymentToken(
                  message.feePaymentToken,
                  message.forceInclusion,
                ),
                message.feePaymentQuoteId,
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
                validatedFeePaymentToken(
                  message.feePaymentToken,
                  message.forceInclusion,
                ),
                message.feePaymentQuoteId,
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

      case "confirmTransactionAsyncLedger": {
        const tabId = message.tabId || sender.tab?.id;
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "confirm",
            resolve: () =>
              dependencies.handleConfirmTransactionAsyncLedger(
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
              error: errorMessage(error, "Failed to confirm Ledger transaction"),
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
