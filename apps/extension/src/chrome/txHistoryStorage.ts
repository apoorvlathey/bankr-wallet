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
  NftTransferRecord,
  SwapMeta,
  TransferMeta,
  TxCallOrigin,
  TxStatus,
} from "./history/types";
export type {
  AssetChangeLeg,
  TxHistoryCursor,
  TxHistoryPage,
} from "./history/queryTypes";
export {
  addTxToHistory,
  getPendingConfirmationTxs,
  getProcessingTxs,
  getTxById,
  getTxHistory,
  getTxHistoryPage,
  updateTxInHistory,
} from "./history/repository";
export {
  cleanupStaleProcessingTxs,
  clearTxHistory,
  clearTxHistoryForAddresses,
} from "./history/maintenance";
