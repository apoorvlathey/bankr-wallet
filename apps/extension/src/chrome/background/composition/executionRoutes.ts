/** Transaction, swap, sponsored-transfer, and status route wiring. */
import { clearAllNonces } from "../../forceInclusion/nonceManager";
import { checkPendingTxReceipt as checkPendingTxReceiptFn } from "../../forceInclusion/receiptPoller";
import { queueAssetChangesBackfill } from "../../receiptEnrichment";
import {
  getTransactionCalldata,
  resolveHistoryNftMetadata,
} from "../../history/detailResolution";
import { getPendingTxRequestById } from "../../requests/pendingTxStorage";
import { getBatchFeePaymentOptions, getInternalSwapFeePaymentOptions, getSafeExecutionFeePaymentOptions, getTransactionFeePaymentOptions } from "../../feePayment/capabilities";
import { prepareFeePaymentQuote } from "../../feePayment/quotes";
import { handleCheckPremiumStatus } from "../../sponsoredTransfers/premiumStatus";
import {
  handleAcknowledgeSponsoredTransfer,
  handleCheckSponsoredTransferStatus,
} from "../../sponsoredTransfers/status";
import { handleSponsoredTransfer } from "../../sponsoredTransfers/handlers";
import {
  clearTxHistory,
  clearTxHistoryForAddresses,
  getProcessingTxs,
  getTxById,
  getTxHistory,
  getTxHistoryPage,
} from "../../txHistoryStorage";
import {
  failedTxResults,
  handleCancelProcessingTx,
  handleConfirmTransaction,
  handleConfirmTransactionAsync,
  handleConfirmTransactionAsyncPK,
  handleConfirmImpersonatedTransaction,
  handleExecuteSwapAtomicPK,
  handleExecuteSwapBatch,
  handleExecuteSwapDirect,
  handleExecuteSwapWithFeeToken,
  handleInitiateTransfer,
  writeResultToStorage,
} from "../../txHandlers";
import { createInternalIrreversibleOperationRunner } from "../internalOperationBarrier";
import { createBackgroundSponsoredTransferMessageRouter } from "../sponsoredTransferRouter";
import { createBackgroundSwapExecutionMessageRouter } from "../swapExecutionRouter";
import { createBackgroundTransactionExecutionMessageRouter } from "../transactionExecutionRouter";
import { createBackgroundTransactionStatusMessageRouter } from "../transactionStatusRouter";
import type { PendingResolutionComposition } from "./pendingResolution";
import { getArbitrumForceInclusionStatus, submitArbitrumForceInclusion } from "../../arbitrumForceInclusion/status";
import { handleConfirmTransactionAsyncLedger } from "../../ledger/transactionExecution";
import { getTransactionNonceForReview } from "../../transactions/nonceReview";
import { prepareTransactionReplacement } from "../../transactions/replacementPreparation";

export function composeExecutionRoutes(
  pending: PendingResolutionComposition,
) {
  const routeBackgroundTransactionExecutionMessage =
    createBackgroundTransactionExecutionMessageRouter({
      getPendingTxRequestById,
      getTransactionNonce: getTransactionNonceForReview,
      prepareTransactionReplacement,
      handleConfirmTransaction,
      handleConfirmTransactionAsync,
      handleConfirmTransactionAsyncPK,
      handleConfirmTransactionAsyncLedger,
      handleConfirmImpersonatedTransaction,
      handleInitiateTransfer,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      writeResultToStorage,
      readLocalStorage: (key) => chrome.storage.local.get(key),
      getFeePaymentOptions: getTransactionFeePaymentOptions,
      getBatchFeePaymentOptions,
      getSafeExecutionFeePaymentOptions,
      getInternalSwapFeePaymentOptions,
      prepareFeePaymentQuote,
    });
  const runInternalIrreversibleOperation =
    createInternalIrreversibleOperationRunner({
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      createRequestId: () => crypto.randomUUID(),
    });
  const routeBackgroundSwapExecutionMessage =
    createBackgroundSwapExecutionMessageRouter({
      runInternalIrreversibleOperation,
      handleExecuteSwapDirect,
      handleExecuteSwapBatch,
      handleExecuteSwapAtomicPK,
      handleExecuteSwapWithFeeToken,
    });

  const routeBackgroundSponsoredTransferMessage =
    createBackgroundSponsoredTransferMessageRouter({
      runInternalIrreversibleOperation,
      handleSponsoredTransfer,
      handleCheckSponsoredTransferStatus,
      handleAcknowledgeSponsoredTransfer,
      handleCheckPremiumStatus,
    });

  const routeBackgroundTransactionStatusMessage =
    createBackgroundTransactionStatusMessageRouter({
      handleCancelProcessingTx,
      failedTxResults,
      removeLocalStorage: (key) => {
        void chrome.storage.local.remove(key);
      },
      getTxHistory,
      getTxHistoryPage,
      getTxHistoryItem: getTxById,
      getTransactionCalldata,
      resolveHistoryNftMetadata,
      queueAssetChangesBackfill,
      getProcessingTxs,
      clearTxHistory,
      clearTxHistoryForAddresses,
      clearAllNonces,
      checkPendingTxReceipt: checkPendingTxReceiptFn,
      getArbitrumForceInclusionStatus,
      submitArbitrumForceInclusion: (txId) =>
        runInternalIrreversibleOperation(() =>
          submitArbitrumForceInclusion(txId),
        ),
    });
  return {
    routeBackgroundTransactionExecutionMessage,
    routeBackgroundSwapExecutionMessage,
    routeBackgroundSponsoredTransferMessage,
    routeBackgroundTransactionStatusMessage,
  };
}
