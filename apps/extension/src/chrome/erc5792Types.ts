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
}

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
