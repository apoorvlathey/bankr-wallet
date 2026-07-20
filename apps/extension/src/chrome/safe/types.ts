import type { AccountType } from "../types";

export type SafeAddress = `0x${string}`;
export type SafeDecimalString = `${bigint}`;

export type SafeCapability =
  | "observe"
  | "approve"
  | "quorumAvailable"
  | "readyToExecute"
  | "blocked";

export type SafeSupportedVersion = "1.3.0" | "1.4.1" | "1.5.0";

export type SafeOperation = 0 | 1;

export interface SafeTransactionData {
  to: SafeAddress;
  value: SafeDecimalString;
  data: `0x${string}`;
  operation: SafeOperation;
  safeTxGas: SafeDecimalString;
  baseGas: SafeDecimalString;
  gasPrice: SafeDecimalString;
  gasToken: SafeAddress;
  refundReceiver: SafeAddress;
  nonce: number;
}

export interface SafeLinkedOwner {
  ownerAddress: SafeAddress;
  accountId: string;
  accountType: Extract<AccountType, "bankr" | "privateKey" | "seedPhrase">;
}

export interface SafeChainSnapshot {
  chainId: number;
  verifiedAtBlock: SafeDecimalString;
  configEpoch: string;
  singleton: SafeAddress;
  version: SafeSupportedVersion;
  owners: SafeAddress[];
  contractOwners: SafeAddress[];
  threshold: number;
  nonce: SafeDecimalString;
  modules: SafeAddress[];
  guard: SafeAddress;
  fallbackHandler: SafeAddress;
  transactionService: "supported" | "unavailable" | "unsupported";
  capability: SafeCapability;
  blockedReason?: string;
}

export interface SafeAccountRecord {
  version: 1;
  accountId: string;
  address: SafeAddress;
  importedBy: "manual" | "ownerDiscovery";
  chains: Record<string, SafeChainSnapshot>;
}

export interface SafeCall {
  to: SafeAddress;
  value: SafeDecimalString;
  data: `0x${string}`;
  operation: SafeOperation;
}

export type SafeProposalState =
  | "draft"
  | "authorizing"
  | "approvedLocally"
  | "publishing"
  | "awaitingApprovals"
  | "readyToExecute"
  | "executing"
  | "executed"
  | "cancelled"
  | "ambiguous"
  | "stale"
  | "replaced"
  | "blocked"
  | "failed";

export interface SafeOwnerConfirmation {
  ownerAddress: SafeAddress;
  accountId?: string;
  accountType?: SafeLinkedOwner["accountType"];
  signature: `0x${string}`;
  createdAt: number;
  publishedAt?: number;
}

export interface SafeUnsupportedConfirmation {
  ownerAddress: SafeAddress;
  signatureType: "contract" | "approvedHash" | "unknown";
  createdAt: number;
}

export interface SafeExecutionExecutor {
  accountId: string;
  accountType: "privateKey" | "seedPhrase";
  address: SafeAddress;
  preparedAt: number;
  gasOverrides?: {
    gasLimit: SafeDecimalString;
    maxFeePerGas: SafeDecimalString;
    maxPriorityFeePerGas: SafeDecimalString;
  };
}

export interface SafeProposalRoute {
  kind: "wallet" | "injected" | "walletConnect" | "erc5792";
  origin?: string;
  tabId?: number;
  frameId?: number;
  topic?: string;
  requestId?: string;
  bundleId?: string;
  detachedAt?: number;
}

export interface SafeProposalRecord {
  version: 1;
  id: string;
  chainId: number;
  safeAccountId: string;
  safeAddress: SafeAddress;
  safeTxHash: `0x${string}`;
  safeVersion: SafeSupportedVersion;
  safeConfigEpoch: string;
  verifiedAtBlock: SafeDecimalString;
  calls: SafeCall[];
  transaction: SafeTransactionData;
  state: SafeProposalState;
  confirmations: SafeOwnerConfirmation[];
  unsupportedConfirmations?: SafeUnsupportedConfirmation[];
  route: SafeProposalRoute;
  /** Canonical same-nonce Safe self-call that rejects competing proposals. */
  purpose?: "rejection";
  createdAt: number;
  updatedAt: number;
  hiddenAt?: number;
  /** Safe transaction hash of the confirmed rejection that consumed this nonce. */
  rejectedBySafeTxHash?: `0x${string}`;
  transactionHash?: `0x${string}`;
  /** Exact signed outer tx bytes retained until terminal reconciliation. */
  serializedExecution?: `0x${string}`;
  executionPreparedAt?: number;
  /** Gas-paying local account bound before the raw outer transaction crosses RPC. */
  executor?: SafeExecutionExecutor;
  error?: string;
  effectClaim?: {
    kind: "approve" | "publish" | "execute";
    claimId: string;
    ownerAddress?: SafeAddress;
    claimedAt: number;
  };
}
