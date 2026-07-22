/** Trusted-UI transport for direct Bankr and local swap execution. */
export const BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES = [
  "executeSwapDirect",
  "executeSwapBatch",
  "executeSwapAtomicPK",
  "executeSwapWithFeeToken",
  "executeStakingDirect",
  "executeStakingBatch",
  "executeStakingAtomicPK",
] as const;
export type BackgroundSwapExecutionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };
export type BackgroundSwapExecutionDependencies = {
  runInternalIrreversibleOperation: <T>(
    resolve: () => Promise<T>,
  ) => Promise<T>;
  handleExecuteSwapDirect: (...args: any[]) => Promise<any>;
  handleExecuteSwapBatch: (...args: any[]) => Promise<any>;
  handleExecuteSwapAtomicPK: (input: any) => Promise<any>;
  handleExecuteSwapWithFeeToken: (input: any) => Promise<any>;
};
const HANDLED_ASYNC: BackgroundSwapExecutionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

function executionError(error: unknown): { success: false; error: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : "Swap execution failed",
  };
}

export function createBackgroundSwapExecutionMessageRouter(
  dependencies: BackgroundSwapExecutionDependencies,
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundSwapExecutionRouteResult {
  return (message, sendResponse) => {
    switch (message?.type) {
      case "executeSwapDirect":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleExecuteSwapDirect(
              message.transactions,
              message.chainName,
              message.gasEstimates,
              {
                accountId: message.accountId,
                fromAddress: message.fromAddress,
              },
            ),
          )
          .then(sendResponse)
          .catch((error) => sendResponse(executionError(error)));
        return HANDLED_ASYNC;

      case "executeStakingDirect":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleExecuteSwapDirect(
              message.transactions,
              message.chainName,
              message.gasEstimates,
              {
                accountId: message.accountId,
                fromAddress: message.fromAddress,
              },
              { allowImpersonator: false },
            ),
          )
          .then(sendResponse)
          .catch((error) => sendResponse(executionError(error)));
        return HANDLED_ASYNC;

      case "executeSwapBatch":
      case "executeStakingBatch":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleExecuteSwapBatch(
              message.batchTx,
              message.originalTransactions,
              message.chainId,
              message.chainName,
              {
                accountId: message.accountId,
                fromAddress: message.fromAddress,
              },
            ),
          )
          .then(sendResponse)
          .catch((error) => sendResponse(executionError(error)));
        return HANDLED_ASYNC;

      case "executeSwapAtomicPK":
      case "executeStakingAtomicPK":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleExecuteSwapAtomicPK({
              originalTransactions: message.originalTransactions,
              chainId: message.chainId,
              chainName: message.chainName,
              accountLock: {
                accountId: message.accountId,
                fromAddress: message.fromAddress,
              },
              gasOverrides: message.gasOverrides,
            }),
          )
          .then(sendResponse)
          .catch((error) => sendResponse(executionError(error)));
        return HANDLED_ASYNC;

      case "executeSwapWithFeeToken":
        dependencies
          .runInternalIrreversibleOperation(() =>
            dependencies.handleExecuteSwapWithFeeToken({
              requestId: message.requestId,
              quoteId: message.quoteId,
              originalTransactions: message.originalTransactions,
              chainId: message.chainId,
              chainName: message.chainName,
              accountLock: {
                accountId: message.accountId,
                fromAddress: message.fromAddress,
              },
            }),
          )
          .then(sendResponse)
          .catch((error) => sendResponse(executionError(error)));
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
