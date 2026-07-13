import { useState } from "react";
import type { GasOverrides } from "@/chrome/txHandlers";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { playInteractionSound } from "@/sounds/soundManager";
import type {
  ConfirmationState,
  TransactionAccountType,
} from "./types";

interface UseTransactionActionsOptions {
  txRequest: PendingTxRequest;
  accountType?: TransactionAccountType;
  isInSidePanel: boolean;
  isErc7715PermissionRevoke: boolean;
  is7702Revoke: boolean;
  is7702SetDelegate: boolean;
  decodedFunctionName?: string;
  gasOverrides: GasOverrides | null;
  forceInclusion: boolean;
  onConfirmed: () => void;
  onRejected: () => void;
  onBeforeReject?: () => void;
  onAddedToBatch?: () => void;
}

export function useTransactionActions({
  txRequest,
  accountType,
  isInSidePanel,
  isErc7715PermissionRevoke,
  is7702Revoke,
  is7702SetDelegate,
  decodedFunctionName,
  gasOverrides,
  forceInclusion,
  onConfirmed,
  onRejected,
  onBeforeReject,
  onAddedToBatch,
}: UseTransactionActionsOptions) {
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const { tx } = txRequest;

  const handleAddToBatch = () => {
    if (isAddingToBatch) return;
    setIsAddingToBatch(true);
    chrome.runtime.sendMessage(
      { type: "addToCrossDappBatch", txId: txRequest.id },
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

  const handleConfirm = async () => {
    void playInteractionSound("transactionConfirm");
    setState("submitting");
    setError("");
    const messageType =
      accountType === "privateKey" || accountType === "seedPhrase"
        ? "confirmTransactionAsyncPK"
        : "confirmTransactionAsync";
    const functionName = isErc7715PermissionRevoke
      ? "Revoke delegated permission"
      : is7702Revoke
        ? "Revoke smart-account delegation"
        : is7702SetDelegate
          ? "Set smart-account delegation"
          : !tx.to
            ? "Contract Deployment"
            : decodedFunctionName || undefined;

    chrome.runtime.sendMessage(
      {
        type: messageType,
        txId: txRequest.id,
        password: "",
        functionName,
        ...(gasOverrides ? { gasOverrides } : {}),
        ...(forceInclusion ? { forceInclusion: true } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          if (forceInclusion) setState("forceInclusion");
          else if (isInSidePanel) onConfirmed();
          else {
            setState("sent");
            setTimeout(() => window.close(), 1000);
          }
        } else {
          setError(result.error || "Failed to submit transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeReject?.();
    chrome.runtime.sendMessage(
      { type: "rejectTransaction", txId: txRequest.id },
      () => {
        onRejected();
      },
    );
  };

  const handleForceInclusionComplete = () => {
    if (isInSidePanel) onConfirmed();
    else {
      setState("sent");
      setTimeout(() => window.close(), 1500);
    }
  };

  const handleForceInclusionError = (message: string) => {
    setError(message);
    setState("error");
  };

  return {
    error,
    handleAddToBatch,
    handleConfirm,
    handleForceInclusionComplete,
    handleForceInclusionError,
    handleReject,
    isAddingToBatch,
    isRejecting,
    state,
  };
}
