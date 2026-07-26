/** Shared manifest, dependency contract, and validation for tx execution routes. */
import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

export type BackgroundTransactionExecutionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundTransactionExecutionDependencies = {
  getPendingTxRequestById: (txId: string) => Promise<any>;
  getTransactionNonce: (txId: string) => Promise<any>;
  prepareTransactionReplacement: (txId: unknown, kind: unknown) => Promise<any>;
  handleConfirmTransaction: (txId: string, password: string) => Promise<any>;
  handleConfirmTransactionAsync: (txId: string, password: string, functionName?: string, forceInclusion?: boolean, feePaymentToken?: "native" | "token", feePaymentQuoteId?: string) => Promise<any>;
  handleConfirmTransactionAsyncPK: (txId: string, password: string, tabId?: number, functionName?: string, gasOverrides?: any, forceInclusion?: boolean, feePaymentToken?: "native" | "token", feePaymentQuoteId?: string, nonce?: unknown) => Promise<any>;
  handleConfirmTransactionAsyncLedger: (txId: string, password: string, tabId?: number, functionName?: string, gasOverrides?: any, forceInclusion?: boolean, nonce?: unknown) => Promise<any>;
  handleConfirmImpersonatedTransaction: (txId: string, functionName?: string, gasOverrides?: any) => Promise<any>;
  handleInitiateTransfer: (message: any) => Promise<any>;
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  readLocalStorage: (key: string) => Promise<Record<string, unknown>>;
  getFeePaymentOptions: (txId: string) => Promise<any>;
  getBatchFeePaymentOptions: (bundleId: string) => Promise<any>;
  getCrossDappBatchFeePaymentOptions: (requestId: string) => Promise<any>;
  getSafeExecutionFeePaymentOptions: (proposalId: string, executorAccountId: string) => Promise<any>;
  prepareFeePaymentQuote: (family: "transaction" | "batchTransaction" | "crossDappBatch" | "safeExecution" | "internalSwap", requestId: string, tokenId: unknown, accountId?: string, requestPayload?: unknown) => Promise<any>;
  getInternalSwapFeePaymentOptions: (accountId: string, requestPayload: unknown) => Promise<any>;
};

export const HANDLED_TRANSACTION_EXECUTION_ASYNC: BackgroundTransactionExecutionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function transactionExecutionError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function respondToTransactionExecution(
  result: Promise<any>,
  sendResponse: (response?: any) => void,
  fallback: string,
): BackgroundTransactionExecutionRouteResult {
  result.then(sendResponse).catch((error) =>
    sendResponse({
      success: false,
      error: transactionExecutionError(error, fallback),
    }),
  );
  return HANDLED_TRANSACTION_EXECUTION_ASYNC;
}

export function getFeePaymentOptionsForMessage(
  dependencies: BackgroundTransactionExecutionDependencies,
  message: any,
): Promise<any> {
  const requestId = typeof message.txId === "string" ? message.txId : "";
  if (message.requestKind === "batch") {
    return dependencies.getBatchFeePaymentOptions(requestId);
  }
  if (message.requestKind === "crossDapp") {
    return dependencies.getCrossDappBatchFeePaymentOptions(requestId);
  }
  if (message.requestKind === "safe") {
    return dependencies.getSafeExecutionFeePaymentOptions(
      requestId,
      typeof message.accountId === "string" ? message.accountId : "",
    );
  }
  if (message.requestKind === "swap") {
    return dependencies.getInternalSwapFeePaymentOptions(
      typeof message.accountId === "string" ? message.accountId : "",
      message.requestPayload,
    );
  }
  return dependencies.getFeePaymentOptions(requestId);
}

export function prepareFeePaymentQuoteForMessage(
  dependencies: BackgroundTransactionExecutionDependencies,
  message: any,
): Promise<any> {
  const requestId = typeof message.requestId === "string" ? message.requestId : "";
  const family = message.requestKind === "batch" ? "batchTransaction"
    : message.requestKind === "crossDapp" ? "crossDappBatch"
    : message.requestKind === "safe" ? "safeExecution"
      : message.requestKind === "swap" ? "internalSwap" : "transaction";
  const accountId = typeof message.accountId === "string" ? message.accountId : undefined;
  return family === "internalSwap"
    ? dependencies.prepareFeePaymentQuote(
        family,
        requestId,
        message.feePaymentToken,
        accountId,
        message.requestPayload,
      )
    : dependencies.prepareFeePaymentQuote(
        family,
        requestId,
        message.feePaymentToken,
        accountId,
      );
}

function feePaymentToken(value: unknown): "native" | "token" {
  if (value === undefined || value === "native") return "native";
  if (value === "token") return "token";
  throw new Error("Invalid gas-payment token");
}

export function validatedFeePaymentToken(value: unknown, forceInclusion: unknown): "native" | "token" {
  const token = feePaymentToken(value);
  if (token === "token" && forceInclusion === true) {
    throw new Error("Force inclusion requires native gas payment");
  }
  return token;
}
