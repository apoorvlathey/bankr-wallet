/** Trusted-UI transport for single-transaction confirmation and transfer intake. */
import {
  HANDLED_TRANSACTION_EXECUTION_ASYNC as HANDLED_ASYNC,
  getFeePaymentOptionsForMessage,
  prepareFeePaymentQuoteForMessage,
  respondToTransactionExecution,
  transactionExecutionError as errorMessage,
  validatedFeePaymentToken,
  type BackgroundTransactionExecutionDependencies, type BackgroundTransactionExecutionRouteResult,
} from "./transactionExecutionRouterSupport";
export type { BackgroundTransactionExecutionDependencies, BackgroundTransactionExecutionRouteResult } from "./transactionExecutionRouterSupport";
export const BACKGROUND_TRANSACTION_EXECUTION_MESSAGE_TYPES = [
  "getTransactionNonce", "prepareTransactionReplacement", "confirmTransaction", "confirmTransactionAsync", "confirmTransactionAsyncPK", "confirmTransactionAsyncLedger", "confirmImpersonatedTransaction", "getFeePaymentOptions", "prepareFeePaymentQuote", "initiateTransfer",
] as const;
export function createBackgroundTransactionExecutionMessageRouter(
  dependencies: BackgroundTransactionExecutionDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundTransactionExecutionRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "prepareTransactionReplacement":
        return respondToTransactionExecution(
          dependencies.prepareTransactionReplacement(message.txId, message.kind),
          sendResponse, "Failed to prepare transaction replacement");
      case "getTransactionNonce": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        return respondToTransactionExecution(dependencies.getTransactionNonce(txId),
          sendResponse, "Failed to load transaction nonce");
      }
      case "getFeePaymentOptions": {
        return respondToTransactionExecution(
          getFeePaymentOptionsForMessage(dependencies, message), sendResponse,
          "Failed to load gas-payment options");
      }

      case "prepareFeePaymentQuote": {
        return respondToTransactionExecution(
          prepareFeePaymentQuoteForMessage(dependencies, message),
          sendResponse, "Failed to prepare fee-token quote",
        );
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
                message.nonce,
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
                message.nonce,
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
      case "confirmImpersonatedTransaction": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "confirm",
            resolve: () =>
              dependencies.handleConfirmImpersonatedTransaction(
                txId,
                message.functionName,
                message.gasOverrides,
              ),
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to submit transaction"),
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
