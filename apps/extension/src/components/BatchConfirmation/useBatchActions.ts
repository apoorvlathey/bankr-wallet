import { useState } from "react";
import type { GasEstimate } from "@/chrome/gasEstimation";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { ConfirmationState } from "./types";
import { playInteractionSound } from "@/sounds/soundManager";

interface UseBatchActionsOptions {
  batchRequest: PendingBatchTxRequest;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "ledger" | "impersonator";
  isInSidePanel: boolean;
  isLocalSigningAccount: boolean;
  cachedGasEstimates: GasEstimate[] | null;
  decodedFunctionNames: Record<number, string>;
  forceInclusion: boolean;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuoteId: string | null;
  customConfirmHandler?: (
    gasEstimates?: GasEstimate[] | null,
  ) => Promise<{ success: boolean; error?: string }>;
  customRejectHandler?: () => Promise<void>;
  onConfirmed: () => void;
  onRejected: () => void;
  onBeforeReject?: () => void;
  onAddedToBatch?: () => void;
  onSplitModalClose: () => void;
}

export function useBatchActions({
  batchRequest,
  accountType,
  isInSidePanel,
  isLocalSigningAccount,
  cachedGasEstimates,
  decodedFunctionNames,
  forceInclusion,
  feePaymentToken,
  feePaymentQuoteId,
  customConfirmHandler,
  customRejectHandler,
  onConfirmed,
  onRejected,
  onBeforeReject,
  onAddedToBatch,
  onSplitModalClose,
}: UseBatchActionsOptions) {
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const [splitting, setSplitting] = useState(false);

  const handleConfirmSplit = async () => {
    if (splitting) return;
    void playInteractionSound("transactionConfirm");
    setSplitting(true);
    try {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: "splitBatchIntoIndividualTxs", bundleId: batchRequest.id },
            (response) => resolve(response),
          );
        },
      );
      if (!result?.success) {
        setError(result?.error || "Failed to split batch");
        setState("error");
      }
      onSplitModalClose();
    } finally {
      setSplitting(false);
    }
  };

  const handleConfirm = async () => {
    void playInteractionSound("transactionConfirm");
    setState("submitting");
    setError("");

    if (customConfirmHandler) {
      const result = await customConfirmHandler(cachedGasEstimates);
      if (result.success) {
        if (isInSidePanel) {
          onConfirmed();
        } else {
          setState("sent");
          setTimeout(() => window.close(), 1000);
        }
      } else {
        setError(result.error || "Failed to submit batch transaction");
        setState("error");
      }
      return;
    }

    const functionNames = batchRequest.params.calls
      .map((_, index) => decodedFunctionNames[index] || undefined)
      .filter(Boolean) as string[];
    const messageType = isLocalSigningAccount
      ? "confirmBatchTransactionAsyncPK"
      : "confirmBatchTransactionAsync";

    chrome.runtime.sendMessage(
      {
        type: messageType,
        bundleId: batchRequest.id,
        password: "",
        functionNames: functionNames.length > 0 ? functionNames : undefined,
        ...(isLocalSigningAccount && cachedGasEstimates
          ? { gasEstimates: cachedGasEstimates }
          : {}),
        ...(forceInclusion ? { forceInclusion: true } : {}),
        feePaymentToken: feePaymentToken === "native" ? "native" : "token",
        ...(feePaymentQuoteId ? { feePaymentQuoteId } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          if (forceInclusion && accountType === "bankr") {
            setState("forceInclusion");
          } else if (isInSidePanel) {
            onConfirmed();
          } else {
            setState("sent");
            setTimeout(() => window.close(), 1000);
          }
        } else {
          setError(result.error || "Failed to submit batch transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeReject?.();
    if (customRejectHandler) {
      customRejectHandler().then(onRejected);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "rejectBatchTransaction", bundleId: batchRequest.id },
      onRejected,
    );
  };

  const handleAddBundleToBatch = () => {
    if (isAddingToBatch) return;
    setIsAddingToBatch(true);
    chrome.runtime.sendMessage(
      { type: "addCallsToCrossDappBatch", bundleId: batchRequest.id },
      (result: { success: boolean; error?: string } | undefined) => {
        if (!result?.success) {
          setIsAddingToBatch(false);
          setError(result?.error || "Failed to add to batch");
          setState("error");
          return;
        }
        if (onAddedToBatch) onAddedToBatch();
        else setIsAddingToBatch(false);
      },
    );
  };

  return {
    state,
    setState,
    error,
    isRejecting,
    isAddingToBatch,
    splitting,
    handleConfirm,
    handleReject,
    handleConfirmSplit,
    handleAddBundleToBatch,
  };
}

export type BatchActions = ReturnType<typeof useBatchActions>;
