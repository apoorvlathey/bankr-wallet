/** Trusted-UI assembly and decision transport for the active cross-dapp batch. */

export const BACKGROUND_CROSS_DAPP_BATCH_MESSAGE_TYPES = [
  "addToCrossDappBatch",
  "addCallsToCrossDappBatch",
  "removeFromCrossDappBatch",
  "updateCallInCrossDappBatch",
  "rejectCrossDappBatch",
  "confirmCrossDappBatch",
] as const;

export type BackgroundCrossDappBatchRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: true };

export type BackgroundCrossDappBatchDependencies = {
  runPendingRequestResolution: <T>(options: any) => Promise<T>;
  runPendingRequestResolutions: <T>(options: any) => Promise<T>;
  pendingResolutionConflict: (action: any) => any;
  handleAddToCrossDappBatch: (txId: string) => Promise<any>;
  handleAddCallsToCrossDappBatch: (bundleId: string) => Promise<any>;
  handleRemoveFromCrossDappBatch: (txId: string) => Promise<any>;
  handleUpdateCallInCrossDappBatch: (...args: any[]) => Promise<any>;
  handleRejectCrossDappBatch: () => Promise<any>;
  handleConfirmCrossDappBatch: (...args: any[]) => Promise<any>;
};

const HANDLED_ASYNC: BackgroundCrossDappBatchRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function resolveActiveBatch(
  options: {
    action: "edit" | "reject" | "confirm";
    resolve: () => Promise<any>;
    fallback: string;
  },
  dependencies: BackgroundCrossDappBatchDependencies,
  sendResponse: (response?: any) => void,
): void {
  dependencies
    .runPendingRequestResolution({
      family: "crossDappBatch",
      requestId: "active",
      action: options.action,
      resolve: options.resolve,
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

export function createBackgroundCrossDappBatchMessageRouter(
  dependencies: BackgroundCrossDappBatchDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundCrossDappBatchRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "addToCrossDappBatch": {
        const txId = typeof message.txId === "string" ? message.txId : "";
        dependencies
          .runPendingRequestResolutions({
            requests: [
              { family: "transaction", requestId: txId, action: "move" },
              {
                family: "crossDappBatch",
                requestId: "active",
                action: "move",
              },
            ],
            resolve: () => dependencies.handleAddToCrossDappBatch(txId),
            conflictResult: (_family: any, _requestId: any, action: any) =>
              dependencies.pendingResolutionConflict(action),
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(
                error,
                "Failed to add transaction to batch",
              ),
            }),
          );
        return HANDLED_ASYNC;
      }
      case "addCallsToCrossDappBatch": {
        const bundleId =
          typeof message.bundleId === "string" ? message.bundleId : "";
        dependencies
          .runPendingRequestResolutions({
            requests: [
              {
                family: "batchTransaction",
                requestId: bundleId,
                action: "move",
              },
              {
                family: "crossDappBatch",
                requestId: "active",
                action: "move",
              },
            ],
            resolve: () =>
              dependencies.handleAddCallsToCrossDappBatch(bundleId),
            conflictResult: (_family: any, _requestId: any, action: any) =>
              dependencies.pendingResolutionConflict(action),
          })
          .then(sendResponse)
          .catch((error) =>
            sendResponse({
              success: false,
              error: errorMessage(error, "Failed to add calls to batch"),
            }),
          );
        return HANDLED_ASYNC;
      }
      case "removeFromCrossDappBatch":
        resolveActiveBatch(
          {
            action: "edit",
            resolve: () =>
              dependencies.handleRemoveFromCrossDappBatch(message.txId),
            fallback: "Failed to remove transaction from batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "updateCallInCrossDappBatch":
        resolveActiveBatch(
          {
            action: "edit",
            resolve: () =>
              dependencies.handleUpdateCallInCrossDappBatch(
                message.txId,
                message.newData,
              ),
            fallback: "Failed to update batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "rejectCrossDappBatch":
        resolveActiveBatch(
          {
            action: "reject",
            resolve: dependencies.handleRejectCrossDappBatch,
            fallback: "Failed to reject cross-dapp batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      case "confirmCrossDappBatch":
        resolveActiveBatch(
          {
            action: "confirm",
            resolve: () =>
              dependencies.handleConfirmCrossDappBatch(
                message.password,
                message.gasEstimates,
              ),
            fallback: "Failed to confirm cross-dapp batch",
          },
          dependencies,
          sendResponse,
        );
        return HANDLED_ASYNC;
      default:
        return { handled: false };
    }
  };
}
