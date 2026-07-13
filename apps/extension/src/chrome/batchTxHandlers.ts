/**
 * Stable ERC-5792 compatibility facade.
 *
 * All policy, credential resolution, and irreversible effects live in the
 * focused batch modules below.
 */

export {
  encodeBatchCalls,
  omitOuterValueForEip7702,
} from "./batch/batchTxEncoding";
export { handleWalletGetCapabilities } from "./batch/batchCapabilities";
export { handleWalletSendCalls } from "./batch/batchRequestIntake";
export { handleConfirmBatchTransaction } from "./batch/batchBankrExecution";
export {
  handleConfirmBatchTransactionPK,
  processBatchTransactionAtomic7702InBackground,
} from "./batch/batchLocalCoordinator";
export type { AtomicBatchHistoryMeta } from "./batch/batchAtomic7702Execution";
export {
  handleRejectBatchTransaction,
  handleRemoveCallFromPendingBatch,
  handleUpdateCallInPendingBatch,
  handleWalletGetCallsStatus,
  handleWalletShowCallsStatus,
} from "./batch/batchRequestStatusHandlers";
