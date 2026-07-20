/** Shared manifest, dependency contract, and validation for tx execution routes. */
import type * as PendingRequestResolutionModule from "../requests/pendingRequestResolution";

export type BackgroundTransactionExecutionRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

export type BackgroundTransactionExecutionDependencies = {
  getPendingTxRequestById: (txId: string) => Promise<any>;
  handleConfirmTransaction: (txId: string, password: string) => Promise<any>;
  handleConfirmTransactionAsync: (txId: string, password: string, functionName?: string, forceInclusion?: boolean, feePaymentToken?: "native" | "token", feePaymentQuoteId?: string) => Promise<any>;
  handleConfirmTransactionAsyncPK: (txId: string, password: string, tabId?: number, functionName?: string, gasOverrides?: any, forceInclusion?: boolean, feePaymentToken?: "native" | "token", feePaymentQuoteId?: string) => Promise<any>;
  handleConfirmTransactionAsyncLedger: (txId: string, password: string, tabId?: number, functionName?: string, gasOverrides?: any, forceInclusion?: boolean) => Promise<any>;
  handleConfirmImpersonatedTransaction: (txId: string, functionName?: string, gasOverrides?: any) => Promise<any>;
  handleInitiateTransfer: (message: any) => Promise<any>;
  runPendingRequestResolution: typeof PendingRequestResolutionModule.runPendingRequestResolution;
  pendingResolutionConflict: (action: any) => any;
  writeResultToStorage: (key: string, result: any) => Promise<void>;
  readLocalStorage: (key: string) => Promise<Record<string, unknown>>;
  getFeePaymentOptions: (txId: string) => Promise<any>;
  getBatchFeePaymentOptions: (bundleId: string) => Promise<any>;
  prepareFeePaymentQuote: (family: "transaction" | "batchTransaction", requestId: string, tokenId: unknown) => Promise<any>;
};

export const HANDLED_TRANSACTION_EXECUTION_ASYNC: BackgroundTransactionExecutionRouteResult = {
  handled: true,
  keepChannelOpen: true,
};

export function transactionExecutionError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
