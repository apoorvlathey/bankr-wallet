import { useMemo, memo } from "react";
import { useToast } from "@chakra-ui/react";
import type {
  PendingBatchTxRequest,
  WalletSendCallsParams,
  ERC5792Call,
} from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import BatchTransactionConfirmation from "@/components/BatchTransactionConfirmation";

/**
 * Thin wrapper around BatchTransactionConfirmation that adapts a user-assembled
 * cross-dapp batch (built up via the "Add to Batch" action on individual tx
 * requests) into the synthetic PendingBatchTxRequest shape that the existing
 * batch confirmation UI consumes.
 *
 * Adds two cross-dapp-only behaviors via the new optional props on
 * BatchTransactionConfirmation:
 *   - onRemoveCall: trash icon to the LEFT of each call (outside the collapse)
 *   - originPerCall: per-call origin/favicon chip in the collapsed header
 *
 * Confirm/reject route through dedicated background messages
 * (`confirmCrossDappBatch` / `rejectCrossDappBatch`) instead of the
 * dapp-initiated batch handlers.
 */

interface CrossDappBatchConfirmationProps {
  batch: CrossDappBatch;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
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
  onNavigate,
}: CrossDappBatchConfirmationProps) {
  const toast = useToast();
  // Cross-dapp batch screen tints the page background so it's instantly
  // distinguishable from a regular dapp batch confirmation. Sourced from
  // status.warning.tint — Bauhaus = cornsilk wash, Midnight = recessed surface.
  const pageBgColor = "status.warning.tint";

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

  const handleCustomConfirm = (): Promise<{ success: boolean; error?: string }> =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "confirmCrossDappBatch", password: "" },
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
      onNavigate={onNavigate}
      onRemoveCall={handleRemoveCall}
      originPerCall={originPerCall}
      titleOverride={`Cross-Dapp Batch (${batch.entries.length} call${batch.entries.length === 1 ? "" : "s"})`}
      customConfirmHandler={handleCustomConfirm}
      customRejectHandler={handleCustomReject}
      // Soft yellow tint so the cross-dapp batch screen is instantly
      // distinguishable from the standard dapp batch confirmation screen.
      pageBgColor={pageBgColor}
    />
  );
}

export default memo(CrossDappBatchConfirmation);
