import { useMemo, memo } from "react";
import { useToast } from "@chakra-ui/react";
import type {
  PendingBatchTxRequest,
  WalletSendCallsParams,
  ERC5792Call,
} from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { GasEstimate } from "@/chrome/gasEstimation";
import BatchTransactionConfirmation from "@/components/BatchTransactionConfirmation";

/**
 * Domain adapter for a user-assembled cross-dapp batch.
 *
 * BatchTransactionConfirmation owns the mobile confirmation composition
 * (OutcomeCard, financial impact, request context, disclosures, and sticky
 * actions). This wrapper only converts persisted cross-dapp entries into that
 * presentation model and supplies the cross-dapp message handlers.
 *
 * Every action remains attributable to its source dapp through
 * `originPerCall`; execution order is never changed for visual grouping.
 */

interface CrossDappBatchConfirmationProps {
  batch: CrossDappBatch;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onBeforeReject?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
}

function CrossDappBatchConfirmation({
  batch,
  currentIndex,
  totalCount,
  isInSidePanel,
  onBack,
  onConfirmed,
  onRejected,
  onBeforeReject,
  onNavigate,
}: CrossDappBatchConfirmationProps) {
  const toast = useToast();

  // Count source applications without reordering the entries. The original
  // call order is execution-critical, while the per-call source labels make
  // origin boundaries visible inside the Actions disclosure.
  const sourceCount = useMemo(
    () =>
      new Set(
        batch.entries.map((entry) => {
          try {
            return new URL(entry.origin).origin;
          } catch {
            return entry.origin;
          }
        }),
      ).size,
    [batch.entries],
  );

  // Build a synthetic PendingBatchTxRequest so we can reuse the existing batch
  // confirmation UI without forking it. The id and origin are placeholders —
  // the cross-dapp batch isn't tied to any single dapp.
  const syntheticBatchRequest: PendingBatchTxRequest = useMemo(() => {
    const calls: ERC5792Call[] = batch.entries.map((entry) => ({
      to: (entry.tx.to ?? "0x") as `0x${string}`,
      value: (entry.tx.value ?? "0x0") as `0x${string}`,
      data: (entry.tx.data ?? "0x") as `0x${string}`,
    }));

    const params: WalletSendCallsParams = {
      version: "2.0.0",
      chainId: `0x${batch.chainId.toString(16)}` as `0x${string}`,
      from: batch.fromAddress as `0x${string}`,
      calls,
      atomicRequired: true,
    };

    return {
      id: `cross-dapp-batch-${batch.createdAt}`,
      params,
      origin: "Cross-Dapp Batch",
      favicon: null,
      chainName: batch.chainName,
      chainId: batch.chainId,
      timestamp: batch.createdAt,
      accountType: batch.accountType,
      // Pin the account so useBatchPlan can resolve a 7702 delegate for PK/SP
      // cross-dapp batches (otherwise the hook treats it as auto-sequential
      // and the authorization banner never shows).
      accountId: batch.accountId,
      accountAddress: batch.fromAddress,
    };
  }, [batch]);

  const originPerCall = useMemo(
    () =>
      batch.entries.map((entry) => ({
        origin: entry.origin,
        favicon: entry.favicon,
      })),
    [batch],
  );

  // The cross-dapp batch ships through its own background handler
  // (`confirmCrossDappBatch`), which fans the resulting tx hash out to every
  // entry's `txResult:{txId}` so all waiting dapp promises resolve at once.
  // We pass these as `customConfirmHandler` / `customRejectHandler` props
  // which override the default `confirmBatchTransactionAsync` /
  // `rejectBatchTransaction` calls inside BatchTransactionConfirmation.

  const handleCustomConfirm = (
    gasEstimates?: GasEstimate[] | null,
  ): Promise<{ success: boolean; error?: string }> =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "confirmCrossDappBatch",
          password: "",
          ...(gasEstimates ? { gasEstimates } : {}),
        },
        (result: { success: boolean; error?: string }) => {
          if (!result?.success) {
            toast({
              title: result?.error || "Failed to ship batch",
              status: "error",
              duration: 4000,
              isClosable: true,
            });
          }
          resolve(result || { success: false, error: "No response" });
        },
      );
    });

  const handleCustomReject = (): Promise<void> =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "rejectCrossDappBatch" },
        () => {
          resolve();
        },
      );
    });

  const handleRemoveCall = (callIndex: number) => {
    const entry = batch.entries[callIndex];
    if (!entry) return;
    chrome.runtime.sendMessage(
      { type: "removeFromCrossDappBatch", txId: entry.txId },
      (result: { success: boolean; error?: string } | undefined) => {
        if (!result?.success) {
          toast({
            title: result?.error || "Failed to remove call",
            status: "error",
            duration: 3000,
          });
        }
      },
    );
  };

  // Edit a single entry's calldata (e.g. user updates an approve amount on a
  // built-in approve CallCard). Routes through a dedicated bg handler since
  // cross-dapp entries live in their own storage key, not pendingBatchTxRequests.
  // On success, the storage listener re-renders this wrapper with fresh entries
  // and the inner BatchTransactionConfirmation re-derives its synthetic batch
  // so simulation + gas + descriptor card all reflect the edit.
  const handleEditCallData = (
    callIndex: number,
    newData: string,
  ): Promise<{ success: boolean; error?: string }> =>
    new Promise((resolve) => {
      const entry = batch.entries[callIndex];
      if (!entry) {
        resolve({ success: false, error: "Entry not found" });
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "updateCallInCrossDappBatch",
          txId: entry.txId,
          newData,
        },
        (result: { success: boolean; error?: string } | undefined) => {
          resolve(result || { success: false, error: "No response" });
        },
      );
    });

  return (
    <BatchTransactionConfirmation
      batchRequest={syntheticBatchRequest}
      currentIndex={currentIndex}
      totalCount={totalCount}
      isInSidePanel={isInSidePanel}
      accountType={batch.accountType}
      accountAddress={batch.fromAddress}
      onBack={onBack}
      onConfirmed={onConfirmed}
      onRejected={onRejected}
      onRejectAll={onRejected}
      onBeforeReject={onBeforeReject}
      onNavigate={onNavigate}
      onRemoveCall={handleRemoveCall}
      onEditCallData={handleEditCallData}
      originPerCall={originPerCall}
      titleOverride={`Review ${sourceCount === 1 ? "app" : `${sourceCount}-app`} batch (${batch.entries.length} action${batch.entries.length === 1 ? "" : "s"})`}
      customConfirmHandler={handleCustomConfirm}
      customRejectHandler={handleCustomReject}
      // Cross-dapp identity is communicated by the title and per-action dapp
      // attribution, not by a warning-colored page tint.
      pageBgColor="surface.base"
    />
  );
}

export default memo(CrossDappBatchConfirmation);
