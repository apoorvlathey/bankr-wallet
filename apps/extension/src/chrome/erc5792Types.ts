/**
 * ERC-5792 type definitions for batch transaction support
 * Spec: https://eips.ethereum.org/EIPS/eip-5792
 */

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface ERC5792Call {
  to?: `0x${string}`;
  data?: `0x${string}`;
  value?: `0x${string}`;
  capabilities?: Record<string, any>;
}

export interface WalletSendCallsParams {
  version: string;
  chainId: `0x${string}`;
  from?: `0x${string}`;
  calls: ERC5792Call[];
  atomicRequired?: boolean;
  id?: string;
  capabilities?: Record<string, any>;
}

export interface WalletSendCallsResult {
  id: string;
}

export interface ReceiptLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
}

export interface BundleReceipt {
  status: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: `0x${string}`;
  gasUsed: `0x${string}`;
  transactionHash: `0x${string}`;
  logs: ReceiptLog[];
}

export interface WalletGetCallsStatusResult {
  version: string;
  id: string;
  chainId: `0x${string}`;
  status: number;
  atomic: boolean;
  receipts?: BundleReceipt[];
  capabilities?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Internal storage types
// ---------------------------------------------------------------------------

export interface WalletConnectRequestMetadata {
  topic: string;
  requestId: number;
  method: string;
}

export interface PendingBatchTxRequest {
  id: string;
  params: WalletSendCallsParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  chainId: number;
  timestamp: number;
  /** Account type at time of request — determines atomic vs non-atomic path */
  accountType?: "bankr" | "impersonator" | "privateKey" | "seedPhrase";
  /** Non-secret ciphertext-generation binding for Bankr signer requests. */
  bankrCredentialTag?: string;
  // SECURITY: trusted context captured at request arrival. Optional on the
  // STORED shape for backward compat with entries written by older builds —
  // new requests must use `PinnedBatchTxRequest` (see below) so the compiler
  // forces these to be set at creation time.
  accountId?: string;
  accountAddress?: string;
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  /** Explicit service-worker-authored request; never accepted from a webpage. */
  trustedInternal?: true;
  /** Exact transport identity for session revocation and stale-request checks. */
  walletConnect?: WalletConnectRequestMetadata;
}

/**
 * Creation-time shape: pinning fields are REQUIRED. Construct via
 * `pinnedBatchTxRequest(account, base)` in ../requests/pinnedRequest`.
 */
export type PinnedBatchTxRequest = PendingBatchTxRequest &
  Required<Pick<PendingBatchTxRequest, "accountId" | "accountAddress" | "accountType">>;

/** Status codes per ERC-5792 */
export const BUNDLE_STATUS = {
  PENDING: 100,
  CONFIRMED: 200,
  OFFCHAIN_FAILURE: 400,
  REVERTED: 500,
  PARTIAL_REVERT: 600,
} as const;

export interface BundleStatus {
  id: string;
  chainId: number;
  status: number;
  atomic: boolean;
  txHash?: string;
  /** Individual tx hashes for non-atomic batches (one per call) */
  txHashes?: string[];
  receipts?: BundleReceipt[];
  createdAt: number;
  completedAt?: number;
  error?: string;
  /** Origin of the dapp that created this bundle — used to scope status lookups. Optional for backward compat with pre-fix entries. */
  origin?: string;
  /** Preserved after the prompt is consumed so session cleanup remains exact. */
  walletConnect?: WalletConnectRequestMetadata;

  // Split mode: user manually broke a dapp-pushed batch into N sequential
  // single-tx confirmations as an escape hatch for non-standard custom chains
  // where batched gas estimation can't be trusted. The bundle stays alive so
  // wallet_getCallsStatus aggregates the per-call receipts.
  /** True after the user clicked "Split into individual txs" on the batch popup. */
  splitMode?: boolean;
  /** Original calls captured at split time so we can drive sequential confirms. */
  splitCalls?: ERC5792Call[];
  /** Index of the next call to surface. Starts at 0; increments after each terminal state. */
  splitNextIndex?: number;
  /**
   * Snapshot of the trusted context from the original PendingBatchTxRequest,
   * captured at split time. Needed because we delete the batch request once
   * split mode starts but still need account/tab/origin info for each
   * individual PendingTxRequest we queue.
   *
   * Account fields are required: split mode is only allowed for batches that
   * have a fully pinned account, so each queued single-tx confirmation can
   * also be a `PinnedTxRequest`.
   */
  splitContext?: {
    accountId: string;
    accountAddress: string;
    accountType: "privateKey" | "seedPhrase";
    origin: string;
    favicon: string | null;
    chainName: string;
    tabId?: number;
    frameId?: number;
    senderOrigin?: string;
    senderWindowId?: number;
    walletConnect?: WalletConnectRequestMetadata;
    trustedInternal?: true;
  };
}

// ---------------------------------------------------------------------------
// Error codes per ERC-5792
// ---------------------------------------------------------------------------

export const ERC5792_ERRORS = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_CAPABILITY: 5700,
  UNSUPPORTED_CHAIN: 5710,
  DUPLICATE_ID: 5720,
  UNKNOWN_BUNDLE_ID: 5730,
  BUNDLE_TOO_LARGE: 5740,
  ATOMIC_UPGRADE_REJECTED: 5750,
  ATOMIC_NOT_SUPPORTED: 5760,
} as const;
