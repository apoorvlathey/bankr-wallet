/**
 * Stable transaction/signature compatibility facade.
 *
 * Security policy and irreversible effects belong to the focused modules
 * below; this file intentionally contains no coordinator implementation.
 */

export {
  activeAbortControllers,
  failedTxResults,
  resolvePinnedAccount,
  writeResultToStorage,
  type FailedTxResult,
  type SignatureResult,
  type TransactionResult,
} from "./transactions/runtime";
export {
  handleSignatureRequest,
  handleTransactionRequest,
} from "./transactions/requestIntake";
export { openExtensionPopup, openPopupWindow } from "./extensionPopup";
export {
  handleAddPrivateKeyAccount,
  handleRemoveAccount,
} from "./transactions/accountMutations";
export { performSecurityReset } from "./transactions/securityReset";
export { handleInitiateTransfer } from "./transactions/internalTransfer";
export { getRpcUrl } from "./transactions/rpcConfig";
export { showNotification } from "./transactions/notification";
export type { GasOverrides } from "./transactions/localExecution";
export { handleConfirmTransactionAsyncPK } from "./transactions/localConfirmation";
export { handleConfirmImpersonatedTransaction } from "./transactions/impersonatedExecution";
export {
  handleConfirmTransaction,
  handleConfirmTransactionAsync,
} from "./transactions/bankrConfirmation";
export {
  handleCancelProcessingTx,
  handleCancelTransaction,
  handleRejectTransaction,
} from "./transactions/requestActions";
export { handleExecuteSwapDirect } from "./transactions/swaps/direct";
export { handleExecuteSwapBatch } from "./transactions/swaps/batch";
export { handleExecuteSwapAtomicPK } from "./transactions/swaps/atomic";
export type {
  SwapAccountLock,
  SwapGasOverride,
  SwapTxEntry,
} from "./transactions/swaps/types";
export {
  handleConfirmSignatureRequest,
  handleConfirmSignatureRequestBankr,
} from "./signatures/confirmationHandlers";
