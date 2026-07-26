/**
 * Stable transaction-simulation compatibility facade.
 *
 * Execution, enrichment, normalization, and fallback policy live in the
 * focused `simulation/` audit domain. Existing consumers keep this import path.
 */

export { KNOWN_TOKEN_LOGOS } from "./tokenLogoConstants";
export type { NftMetadata } from "./nftMetadata";
export { simulateBatchAssetChanges } from "./simulation/batchSimulation";
export { getNativeCurrency } from "./simulation/nativeCurrency";
export { retryTokenMetadata } from "./simulation/metadataRetry";
export { simulateBatchAssetChangesNonAtomic } from "./simulation/nonAtomicBatch";
export { simulateAssetChanges } from "./simulation/singleSimulation";
export { simulateSafeAssetChanges } from "./simulation/safeSimulation";
export { SIMULATOR_BYTECODE } from "./simulation/simulatorContract";
export type {
  ApprovalChange,
  ApprovalChangeType,
  ApprovalSystem,
  ApprovalVerification,
  ResidualApproval,
  AssetChange,
  NftAssetInfo,
  NftStandard,
  SimulationResult,
  TokenMetadataResult,
} from "./simulation/types";
export type {
  ResidualApprovalDetectionResult,
  ResidualApprovalRequestRef,
} from "./simulation/residualApprovalRequestTypes";
