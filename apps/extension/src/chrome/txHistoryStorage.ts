/**
 * Stable transaction-history compatibility facade.
 *
 * Storage authority, maintenance, enrichment, and record definitions live in
 * `history/`; this root path remains for released callers and type imports.
 */

export type {
  AssetChangeRecord,
  AssetTransferRecord,
  BridgeMeta,
  ClearSignedMeta,
  CompletedTransaction,
  ForceInclusionMeta,
  GasData,
  PrivacyRagequitHistoryMeta,
  PrivacyShieldHistoryMeta,
  SwapMeta,
  TransferMeta,
  TxCallOrigin,
  TxStatus,
} from "./history/types";
export {
  addTxToHistory,
  getPendingConfirmationTxs,
  getProcessingTxs,
  getTxById,
  getTxHistory,
  updateTxInHistory,
} from "./history/repository";
export {
  cleanupStaleProcessingTxs,
  clearTxHistory,
  clearTxHistoryForAddresses,
} from "./history/maintenance";
