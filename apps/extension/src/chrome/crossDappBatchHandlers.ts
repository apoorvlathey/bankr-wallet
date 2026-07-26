/** Stable cross-dapp batch compatibility facade. */
export {
  handleAddCallsToCrossDappBatch,
  handleAddApprovalRevokeToTransactionBatch,
  handleAddApprovalRevokesToTransactionBatch,
  handleAddToCrossDappBatch,
} from "./crossDappBatch/intake";
export {
  handleRejectCrossDappBatch,
  handleRemoveFromCrossDappBatch,
  handleUpdateCallInCrossDappBatch,
} from "./crossDappBatch/staging";
export {
  handleAppendApprovalRevokeToCrossDappBatch,
  handleAppendApprovalRevokesToCrossDappBatch,
} from "./crossDappBatch/approvalCleanup";
export { handleConfirmCrossDappBatch } from "./crossDappBatch/confirmation";
