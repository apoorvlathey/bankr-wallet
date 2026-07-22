import { useCallback, useRef, useState } from "react";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import type { GasOverrides } from "@/chrome/txHandlers";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import type {
  SafeExecutorAccount,
  SafeOwnerAccount,
  SafeProposalActionKind,
} from "../safeProposalActionModel";
import { getSafeProposalDisplayActionKind } from "../safeProposalActionModel";

type SafeProposalOperation = "approve" | "execute" | "reject" | "secondary";

function send<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

export function useSafeProposalActions({
  proposal,
  actionKind,
  selectedOwner,
  selectedExecutor,
  gasOverrides,
  feePaymentToken,
  feePaymentQuote,
  onBack,
  onOpenProposal,
  onReload,
}: {
  proposal: SafeProposalRecord;
  actionKind: SafeProposalActionKind;
  selectedOwner: SafeOwnerAccount | null;
  selectedExecutor: SafeExecutorAccount | null;
  gasOverrides: GasOverrides | null;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  onBack: () => void;
  onOpenProposal: (proposalId: string) => void;
  onReload: () => Promise<void>;
}) {
  const operationRef = useRef<SafeProposalOperation | null>(null);
  const [operation, setOperation] = useState<SafeProposalOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const beginOperation = useCallback((next: SafeProposalOperation) => {
    if (operationRef.current) return false;
    operationRef.current = next;
    setOperation(next);
    setError(null);
    setNotice(null);
    return true;
  }, []);

  const endOperation = useCallback(() => {
    operationRef.current = null;
    setOperation(null);
  }, []);

  const runAction = useCallback(async (
    message: Record<string, unknown>,
    successNotice?: string,
    requestedOperation: SafeProposalOperation = "secondary",
  ) => {
    if (!beginOperation(requestedOperation)) return false;
    try {
      const response = await send<{
        success: boolean;
        result?: SafeProposalRecord;
        error?: string;
      }>(message);
      if (!response.success) {
        throw new Error(response.error || "Safe operation failed");
      }
      if (successNotice) setNotice(successNotice);
      await onReload().catch(() => undefined);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Safe operation failed");
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, onReload]);

  const handleConfirm = useCallback(async (options?: {
    allowSimulationFailure?: boolean;
  }) => {
    if (actionKind === "approve" && selectedOwner) {
      if (!beginOperation("approve")) return;
      try {
        const approval = await send<{ success: boolean; error?: string }>({
          type: "approveSafeProposal",
          proposalId: proposal.id,
          ownerAccountId: selectedOwner.id,
        });
        if (!approval.success) {
          throw new Error(approval.error || "Could not approve Safe request");
        }
        const publication = await send<{ success: boolean; error?: string }>({
          type: "publishSafeProposal",
          proposalId: proposal.id,
        });
        if (!publication.success) {
          throw new Error(publication.error || "Approval saved locally; sharing needs retry");
        }
        setNotice("Signed offchain.");
        await onReload();
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Safe approval failed");
        return false;
      } finally {
        endOperation();
      }
    }
    const nativePayment = feePaymentToken === "native";
    if (
      actionKind === "execute" &&
      selectedExecutor &&
      ((nativePayment && gasOverrides) || (!nativePayment && feePaymentQuote?.quoteId))
    ) {
      return runAction({
        type: "executeSafeProposal",
        proposalId: proposal.id,
        executorAccountId: selectedExecutor.id,
        ...(nativePayment ? { gasOverrides } : {}),
        feePaymentToken: nativePayment ? "native" : "token",
        ...(!nativePayment && feePaymentQuote?.quoteId
          ? { feePaymentQuoteId: feePaymentQuote.quoteId }
          : {}),
        allowSimulationFailure: options?.allowSimulationFailure === true,
      }, undefined, "execute");
    }
    return false;
  }, [
    actionKind,
    beginOperation,
    endOperation,
    gasOverrides,
    feePaymentQuote,
    feePaymentToken,
    onReload,
    proposal.id,
    runAction,
    selectedExecutor,
    selectedOwner,
  ]);

  const handleReject = useCallback(async () => {
    if (!beginOperation("reject")) return;
    try {
      const response = await send<{
        success: boolean;
        result?: {
          kind: "cancelledLocally" | "onchain";
          proposal: SafeProposalRecord;
        };
        error?: string;
      }>({
        type: "startSafeProposalRejection",
        proposalId: proposal.id,
      });
      if (!response.success || !response.result) {
        throw new Error(response.error || "Could not reject Safe transaction");
      }
      await onReload();
      if (response.result.kind === "onchain") {
        onOpenProposal(response.result.proposal.id);
      } else {
        onBack();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Safe rejection failed");
    } finally {
      endOperation();
    }
  }, [
    beginOperation,
    endOperation,
    onBack,
    onOpenProposal,
    onReload,
    proposal.id,
  ]);

  const handleNonceChange = useCallback(async (nonce: string) => {
    if (!beginOperation("secondary")) return false;
    try {
      const response = await send<{
        success: boolean;
        result?: SafeProposalRecord;
        error?: string;
      }>({
        type: "changeSafeProposalNonce",
        proposalId: proposal.id,
        nonce,
      });
      if (!response.success || !response.result) {
        throw new Error(response.error || "Could not update Safe nonce");
      }
      setNotice("Safe nonce updated.");
      await onReload();
      onOpenProposal(response.result.id);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update Safe nonce");
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, onOpenProposal, onReload, proposal.id]);

  return {
    busy: operation !== null,
    error,
    handleConfirm,
    handleReject,
    handleNonceChange,
    notice,
    operation,
    primaryActionKind: getSafeProposalDisplayActionKind(actionKind, operation),
    runAction,
  };
}
