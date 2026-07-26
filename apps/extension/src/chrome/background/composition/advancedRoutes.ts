/** Batch, delegation, delegated-permission, and simulation route wiring. */

import { getTabAccount } from "../../accountStorage";
import { estimateBatchGasSequential } from "../../batchGasEstimation";
import {
  handleConfirmBatchTransaction,
  handleConfirmBatchTransactionPK,
  handleAppendApprovalRevokesToPendingBatch,
  handleRejectBatchTransaction,
  handleRemoveCallFromPendingBatch,
  handleUpdateCallInPendingBatch,
  handleWalletGetCallsStatus,
  handleWalletGetCapabilities,
  handleWalletSendCalls,
  handleWalletShowCallsStatus,
} from "../../batchTxHandlers";
import {
  handleAddCallsToCrossDappBatch,
  handleAppendApprovalRevokesToCrossDappBatch,
  handleAddApprovalRevokesToTransactionBatch,
  handleAddToCrossDappBatch,
  handleConfirmCrossDappBatch,
  handleRejectCrossDappBatch,
  handleRemoveFromCrossDappBatch,
  handleUpdateCallInCrossDappBatch,
} from "../../crossDappBatchHandlers";
import {
  handleGetDelegationStatus,
  handleInitiateRevokeDelegation,
  handleInitiateSetDelegation,
  handleProbeDelegateContract,
} from "../../delegationHandlers";
import {
  getActiveErc7715PermissionGrantsWithOnchainSync,
  handleErc7715PermissionMethod,
  handleInitiateErc7715PermissionRevoke,
  isErc7715PermissionMethod,
} from "../../erc7715PermissionHandlers";
import { handleSplitBatchIntoIndividualTxs } from "../../forceInclusion/splitBatchSequencer";
import { estimateGas } from "../../gasEstimation";
import { getPendingErc7715PermissionRequests } from "../../pendingErc7715PermissionStorage";
import { getPendingBatchTxRequests } from "../../requests/pendingBatchTxStorage";
import { updatePendingTxRequestData } from "../../requests/pendingTxStorage";
import {
  retryTokenMetadata,
  simulateAssetChanges,
  simulateBatchAssetChanges,
  simulateBatchAssetChangesNonAtomic,
  simulateSafeAssetChanges,
} from "../../txSimulation";
import { writeResultToStorage } from "../../txHandlers";
import { authorizeConnectedDappRequest } from "../../dapp/requestPolicy";
import { createBackgroundBatchRequestMessageRouter } from "../batchRequestRouter";
import { createBackgroundCrossDappBatchMessageRouter } from "../crossDappBatchRouter";
import { createBackgroundDelegationMessageRouter } from "../delegationRouter";
import { createBackgroundErc7715PermissionMessageRouter } from "../erc7715PermissionRouter";
import { createBackgroundGasSimulationMessageRouter } from "../gasSimulationRouter";
import { detectResidualApprovalsForPendingRequest } from "../../approvalCleanup/detection";
import { resolveApprovalCleanupEvidence } from "../../approvalCleanup/evidenceRegistry";
import type { PendingResolutionComposition } from "./pendingResolution";

export function composeAdvancedRoutes(
  pending: PendingResolutionComposition,
) {
  const routeBackgroundBatchRequestMessage =
    createBackgroundBatchRequestMessageRouter({
      authorizeConnectedDappRequest,
      getTabAccount,
      handleWalletGetCapabilities,
      handleWalletSendCalls,
      handleWalletGetCallsStatus,
      handleWalletShowCallsStatus,
      getPendingBatchTxRequests,
      handleConfirmBatchTransaction,
      handleConfirmBatchTransactionPK,
      handleRejectBatchTransaction,
      handleSplitBatchIntoIndividualTxs,
      handleRemoveCallFromPendingBatch,
      handleUpdateCallInPendingBatch,
      handleAppendApprovalRevokesToPendingBatch,
      resolveApprovalCleanupEvidence,
      updatePendingTxRequestData,
      runPendingRequestResolution: pending.runPendingRequestResolution,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      writeResultToStorage,
    });

  const routeBackgroundDelegationMessage =
    createBackgroundDelegationMessageRouter({
      handleGetDelegationStatus,
      handleProbeDelegateContract,
      handleInitiateRevokeDelegation,
      handleInitiateSetDelegation,
    });

  const routeBackgroundCrossDappBatchMessage =
    createBackgroundCrossDappBatchMessageRouter({
      runPendingRequestResolution: pending.runPendingRequestResolution,
      runPendingRequestResolutions: pending.runPendingRequestResolutions,
      pendingResolutionConflict: pending.pendingResolutionConflict,
      handleAddToCrossDappBatch,
      handleAddApprovalRevokesToTransactionBatch,
      handleAddCallsToCrossDappBatch,
      handleAppendApprovalRevokesToCrossDappBatch,
      resolveApprovalCleanupEvidence,
      handleRemoveFromCrossDappBatch,
      handleUpdateCallInCrossDappBatch,
      handleRejectCrossDappBatch,
      handleConfirmCrossDappBatch,
    });

  const routeBackgroundErc7715PermissionMessage =
    createBackgroundErc7715PermissionMessageRouter({
      getPendingRequests: getPendingErc7715PermissionRequests,
      getActiveGrantsWithOnchainSync:
        getActiveErc7715PermissionGrantsWithOnchainSync,
      initiateRevoke: handleInitiateErc7715PermissionRevoke,
      authorizeConnectedDappRequest,
      isPermissionMethod: isErc7715PermissionMethod,
      getTabAccount,
      handlePermissionMethod: handleErc7715PermissionMethod,
    });

  const routeBackgroundGasSimulationMessage =
    createBackgroundGasSimulationMessageRouter({
      estimateGas,
      estimateForceInclusionGas: async (tx, accountAddress) => {
        const { estimateForceInclusionGas } = await import(
          "../../forceInclusion/single"
        );
        return estimateForceInclusionGas(tx, accountAddress);
      },
      estimateBatchGasSequential,
      simulateAssetChanges,
      simulateBatchAssetChanges,
      simulateBatchAssetChangesNonAtomic,
      simulateSafeAssetChanges,
      detectResidualApprovals: detectResidualApprovalsForPendingRequest,
      retryTokenMetadata,
    });

  return {
    routeBackgroundBatchRequestMessage,
    routeBackgroundDelegationMessage,
    routeBackgroundCrossDappBatchMessage,
    routeBackgroundErc7715PermissionMessage,
    routeBackgroundGasSimulationMessage,
  };
}
