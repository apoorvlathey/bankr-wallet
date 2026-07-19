/** Transaction, swap, sponsored-transfer, and status route wiring. */

import { clearAllNonces } from "../../forceInclusion/nonceManager";
import { checkPendingTxReceipt as checkPendingTxReceiptFn } from "../../forceInclusion/receiptPoller";
import { queueAssetChangesBackfill } from "../../receiptEnrichment";
import { getPendingTxRequestById } from "../../requests/pendingTxStorage";
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
  getTxHistory,
} from "../../txHistoryStorage";
import {
  failedTxResults,
  handleCancelProcessingTx,
  handleConfirmTransaction,
  handleConfirmTransactionAsync,
  handleConfirmTransactionAsyncPK,
  handleExecuteSwapAtomicPK,
  handleExecuteSwapBatch,
  handleExecuteSwapDirect,
  handleInitiateTransfer,
  writeResultToStorage,
} from "../../txHandlers";
import { createInternalIrreversibleOperationRunner } from "../internalOperationBarrier";
import { createBackgroundSponsoredTransferMessageRouter } from "../sponsoredTransferRouter";
import { createBackgroundSwapExecutionMessageRouter } from "../swapExecutionRouter";
import { createBackgroundTransactionExecutionMessageRouter } from "../transactionExecutionRouter";
import { createBackgroundTransactionStatusMessageRouter } from "../transactionStatusRouter";
import type { PendingResolutionComposition } from "./pendingResolution";
import {
  getArbitrumForceInclusionStatus,
  submitArbitrumForceInclusion,
} from "../../arbitrumForceInclusion/status";

export function composeExecutionRoutes(
  pending: PendingResolutionComposition,
) {
  const routeBackgroundTransactionExecutionMessage =
    createBackgroundTransactionExecutionMessageRouter({
      getPendingTxRequestById,
      handleConfirmTransaction,
      handleConfirmTransactionAsync,
      handleConfirmTransactionAsyncPK,
      handleInitiateTransfer,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      writeResultToStorage,
      readLocalStorage: (key) => chrome.storage.local.get(key),
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
