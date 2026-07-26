/** ERC-5792 provider transport and trusted-UI batch decision routing. */

export const BACKGROUND_BATCH_REQUEST_MESSAGE_TYPES = [
  "walletGetCapabilities",
  "walletSendCalls",
  "walletGetCallsStatus",
  "walletShowCallsStatus",
  "getPendingBatchTxRequests",
  "confirmBatchTransactionAsync",
  "confirmBatchTransactionAsyncPK",
  "rejectBatchTransaction",
  "splitBatchIntoIndividualTxs",
  "removeCallFromPendingBatch",
  "updateCallInPendingBatch",
  "appendApprovalRevokeToPendingBatch",
  "updatePendingTxRequestData",
] as const;

export type BackgroundBatchRequestRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundBatchRequestDependencies = {
  authorizeConnectedDappRequest: (sender: chrome.runtime.MessageSender) => Promise<any>;
  getTabAccount: (tabId: number) => Promise<any>;
  handleWalletGetCapabilities: (...args: any[]) => Promise<any>;
  handleWalletSendCalls: (...args: any[]) => Promise<any>;
  handleWalletGetCallsStatus: (...args: any[]) => Promise<any>;
  handleWalletShowCallsStatus: (...args: any[]) => any;
  getPendingBatchTxRequests: () => Promise<any>;
  handleConfirmBatchTransaction: (...args: any[]) => Promise<any>;
  handleConfirmBatchTransactionPK: (...args: any[]) => Promise<any>;
  handleRejectBatchTransaction: (bundleId: string) => Promise<any>;
  handleSplitBatchIntoIndividualTxs: (...args: any[]) => Promise<any>;
  handleRemoveCallFromPendingBatch: (...args: any[]) => Promise<any>;
  handleUpdateCallInPendingBatch: (...args: any[]) => Promise<any>;
  handleAppendApprovalRevokeToPendingBatch: (...args: any[]) => Promise<any>;
  handleAppendApprovalRevokesToPendingBatch: (...args: any[]) => Promise<any>;
  updatePendingTxRequestData: (txId: string, newData: string) => Promise<void>;
  runPendingRequestResolution: <T>(options: any) => Promise<T>;
  pendingResolutionConflict: (action: any) => any;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
};

const HANDLED_ASYNC: BackgroundBatchRequestRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_PROVIDER: BackgroundBatchRequestRouteResult = {
  handled: true,
  keepChannelOpen: false,
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

function resolveBatchAction(
  options: {
    bundleId: unknown;
    action: "confirm" | "reject" | "edit" | "split";
    resolve: (bundleId: string) => Promise<any>;
    fallback: string;
  },
  dependencies: BackgroundBatchRequestDependencies,
  sendResponse: (response?: any) => void,
): void {
  const bundleId =
    typeof options.bundleId === "string" ? options.bundleId : "";
  dependencies
    .runPendingRequestResolution({
      family: "batchTransaction",
      requestId: bundleId,
      action: options.action,
      resolve: () => options.resolve(bundleId),
      conflictResult: dependencies.pendingResolutionConflict,
    })
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        success: false,
        error: errorMessage(error, options.fallback),
      }),
    );
}

export function createBackgroundBatchRequestMessageRouter(
  dependencies: BackgroundBatchRequestDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundBatchRequestRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "walletGetCapabilities":
        void (async () => {
          const authorization =
            await dependencies.authorizeConnectedDappRequest(sender);
          if (!authorization.authorized) {
            await dependencies.writeResultToStorage(
              `capabilitiesResult:${message.requestId}`,
              {
                success: false,
                error: authorization.error,
                code: authorization.code,
              },
            );
            return;
          }
          const account =
            typeof sender.tab?.id === "number"
              ? await dependencies.getTabAccount(sender.tab.id)
              : undefined;
          const result = await dependencies.handleWalletGetCapabilities(
            message.address,
            message.chainIds,
            account ?? undefined,
          );
          await dependencies.writeResultToStorage(
            `capabilitiesResult:${message.requestId}`,
            result,
          );
        })();
        return HANDLED_PROVIDER;
      case "walletSendCalls": {
        const senderWindowId = sender.tab?.windowId;
        void dependencies
          .runPendingRequestResolution({
            family: "batchTransaction",
            requestId: message.bundleId,
            action: "confirm",
            conflictResult: () => undefined,
            resolve: async () => {
              const authorization =
                await dependencies.authorizeConnectedDappRequest(sender);
              if (!authorization.authorized) {
                await dependencies.writeResultToStorage(
                  `batchTxAck:${message.bundleId}`,
                  {
                    success: false,
                    error: authorization.error,
                    code: authorization.code,
                  },
                );
                return;
              }
              await dependencies.handleWalletSendCalls(
                message.params,
                message.bundleId,
                authorization.origin,
                message.favicon,
                senderWindowId,
                authorization.origin,
                authorization.tabId,
                sender.frameId,
              );
            },
          })
          .catch((error) =>
            dependencies
              .writeResultToStorage(`batchTxAck:${message.bundleId}`, {
                success: false,
                error: errorMessage(error, "Failed to queue batch transaction"),
                code: -32000,
              })
              .catch(() => undefined),
          );
        return HANDLED_PROVIDER;
      }
      case "walletGetCallsStatus":
        void dependencies
          .authorizeConnectedDappRequest(sender)
          .then(async (authorization) => {
            if (!authorization.authorized) {
              await dependencies.writeResultToStorage(
                `callsStatusResult:${message.requestId}`,
                {
                  success: false,
                  error: authorization.error,
                  code: authorization.code,
                },
              );
              return;
            }
            const result = await dependencies.handleWalletGetCallsStatus(
              message.bundleId,
              authorization.origin,
            );
            await dependencies.writeResultToStorage(
              `callsStatusResult:${message.requestId}`,
              result,
            );
          });
        return HANDLED_PROVIDER;
      case "walletShowCallsStatus":
        void dependencies
          .authorizeConnectedDappRequest(sender)
          .then((authorization) => {
            if (authorization.authorized) {
              dependencies.handleWalletShowCallsStatus(
                message.bundleId,
                authorization.origin,
              );
            }
          });
        return HANDLED_PROVIDER;
      case "getPendingBatchTxRequests":
        dependencies.getPendingBatchTxRequests().then(sendResponse);
        return HANDLED_ASYNC;
      case "confirmBatchTransactionAsync":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "confirm",
            resolve: (bundleId) =>
              dependencies.handleConfirmBatchTransaction(
                bundleId,
                message.password,
                message.functionNames,
                message.forceInclusion,
                validatedFeePaymentToken(
                  message.feePaymentToken,
                  message.forceInclusion,
                ),
                message.feePaymentQuoteId,
              ),
            fallback: "Failed to confirm batch transaction",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "confirmBatchTransactionAsyncPK":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "confirm",
            resolve: (bundleId) =>
              dependencies.handleConfirmBatchTransactionPK(
                bundleId,
                message.password,
                message.tabId,
                message.functionNames,
                message.gasEstimates,
                message.forceInclusion,
                validatedFeePaymentToken(
                  message.feePaymentToken,
                  message.forceInclusion,
                ),
                message.feePaymentQuoteId,
              ),
            fallback: "Failed to confirm batch transaction",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "rejectBatchTransaction":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "reject",
            resolve: dependencies.handleRejectBatchTransaction,
            fallback: "Failed to reject batch transaction",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "splitBatchIntoIndividualTxs":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "split",
            resolve: (bundleId) =>
              dependencies.handleSplitBatchIntoIndividualTxs(
                bundleId,
                sender.tab?.windowId,
              ),
            fallback: "Failed to split batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "removeCallFromPendingBatch":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "edit",
            resolve: (bundleId) =>
              dependencies.handleRemoveCallFromPendingBatch(
                bundleId,
                message.callIndex,
              ),
            fallback: "Failed to update batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "appendApprovalRevokeToPendingBatch":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "edit",
            resolve: (bundleId) =>
              Array.isArray(message.approvals)
                ? dependencies.handleAppendApprovalRevokesToPendingBatch(
                    bundleId,
                    message.approvals,
                  )
                : dependencies.handleAppendApprovalRevokeToPendingBatch(
                    bundleId,
                    message.tokenAddress,
                    message.spender,
                  ),
            fallback: "Failed to add approval cleanup",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "updateCallInPendingBatch":
        resolveBatchAction(
          {
            bundleId: message.bundleId,
            action: "edit",
            resolve: (bundleId) =>
              dependencies.handleUpdateCallInPendingBatch(
                bundleId,
                message.callIndex,
                message.newData,
              ),
            fallback: "Failed to update batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "updatePendingTxRequestData": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolution({
            family: "transaction",
            requestId: txId,
            action: "edit",
            resolve: async () => {
              await dependencies.updatePendingTxRequestData(
                txId,
                message.newData,
              );
              return { success: true };
            },
            conflictResult: dependencies.pendingResolutionConflict,
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        return HANDLED_ASYNC;
      }
      default:
        return { handled: false };
    }
  };
}
