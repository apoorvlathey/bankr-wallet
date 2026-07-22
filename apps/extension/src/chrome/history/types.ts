import type { TransactionParams } from "../bankr/submission";
import type { Erc7715PermissionRevokeMeta } from "../requests/pendingTxStorage";
import type { PrivacyShieldLifecycleState } from "../../lib/privacyShieldLifecycle";

export type TxStatus = "processing" | "pending" | "success" | "failed";

export interface SwapMeta {
  sellTokenSymbol: string;
  sellTokenLogo: string | null;
  buyTokenSymbol: string;
  buyTokenLogo: string | null;
}

export interface TransferMeta {
  recipient: string;
  amount: string;
  symbol: string;
  tokenLogo: string | null;
}

/**
 * Submission-time clear-signing snapshot. Activity can render the reviewed
 * intent without re-running decoders or remote name lookups. Keeping the
 * whole snapshot optional preserves entries released before clear signing.
 */
export interface ClearSignedMeta {
  kind: "approve" | "transfer" | "nativeSend" | "erc7730";
  /** Formatted decimal amount; omitted for descriptor-only ERC-7730 calls. */
  amount?: string;
  /** Token/native symbol captured by the confirmation surface. */
  tokenSymbol?: string;
  /** Decimal precision captured with the formatted amount. */
  tokenDecimals?: number;
  tokenLogo?: string | null;
  /** ERC-20 contract for approve/transfer records. */
  tokenAddress?: string;
  /** Approve amount at or above 2^128. */
  isInfinite?: boolean;
  /** Zero-value allowance revoke. */
  isRevoke?: boolean;
  /** Spender, recipient, or called contract. */
  counterparty?: string;
  counterpartyLabel?: string;
  counterpartyEns?: string;
  /** ERC-7730 descriptor intent and contract label. */
  intent?: string;
  contractName?: string;
}

/** Metadata for OP Stack deposits and Arbitrum delayed-inbox transactions. */
export interface ForceInclusionMeta {
  l1TxHash: string;
  l1ChainId: number;
  l2ChainId: number;
  l2Confirmed?: boolean;
  /** Missing on records released before protocol tagging; those are OP Stack. */
  protocol?: "op-stack" | "arbitrum";
  l2TxHash?: string;
  inbox?: `0x${string}`;
  bridge?: `0x${string}`;
  sequencerInbox?: `0x${string}`;
  messageIndex?: string;
  messageBlockNumber?: string;
  messageBlockHash?: `0x${string}`;
  messageTimestamp?: string;
  kind?: number;
  sender?: `0x${string}`;
  baseFeeL1?: string;
  messageDataHash?: `0x${string}`;
  forceDeadlineBlock?: string;
  forceTransactionHash?: `0x${string}`;
}

/**
 * One ERC-20 transfer involving the observed account. Internal pool routing
 * is excluded by the parser before this public snapshot is persisted.
 */
export interface AssetTransferRecord {
  /** Lowercased token contract. */
  token: string;
  direction: "in" | "out";
  /** Lowercased other side of the transfer. */
  counterparty: string;
  /** Base-unit amount as a decimal string. */
  amountWei: string;
  /** Metadata is optional because extraction must tolerate provider failure. */
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

/** Post-confirm asset-change snapshot for one chain leg. */
export interface AssetChangeRecord {
  /** Mined block number as a decimal string. */
  blockNumber: string;
  /**
   * Signed native flow after adding sender gas back. Undefined when historical
   * balances cannot be resolved; consumers then hide only the native row.
   */
  nativeDelta?: string;
  erc20Transfers: AssetTransferRecord[];
}

/** Source-chain bridge metadata with an optional settled destination leg. */
export interface BridgeMeta {
  /** Socket quote ID retained under its released field name. */
  requestHash?: string;
  sourceChainId: number;
  sourceTxHash?: string;
  destinationChainId: number;
  destinationChainName: string;
  /** Filled only after bridge settlement discovers the destination leg. */
  destinationTxHash?: string;
  bungeeStatusCode?: number;
  routeName?: string;
  /** Defaults to the source sender when absent. */
  receiverAddress?: string;
  refundTxHash?: string;
}

export interface TxCallOrigin {
  origin: string;
  favicon: string | null;
}

export interface GasData {
  gasUsed: string;
  gasLimit: string;
  effectiveGasPrice: string;
  /** Marks the paid L1 deposit fee that owns force-inclusion accounting. */
  feeSource?: "forceInclusionL1";
  l1Fee?: string;
  l1GasUsed?: string;
  l1GasPrice?: string;
}

/** Bounded public Shield lifecycle projection for the normal Activity row. */
export interface PrivacyShieldHistoryMeta {
  version: 1;
  operationId: string;
  state: PrivacyShieldLifecycleState;
  updatedAt: number;
  amountWei: string;
  shieldedAmountWei: string;
}

/**
 * Public, non-linking marker for a Privacy Pools public exit. The operation
 * identifiers and commitment details stay in the encrypted ragequit store;
 * Activity needs only this versioned marker to keep the transaction in the
 * Private wallet surface.
 */
export interface PrivacyRagequitHistoryMeta {
  version: 1;
}

/** Public marker used only to suppress the duplicate normal transaction row. */
export interface PrivacyUnshieldHistoryMeta {
  version: 1;
}

/**
 * Released `txHistory` record shape. All enrichment fields remain optional so
 * entries written by earlier extension versions continue to decode as-is.
 */
export interface CompletedTransaction {
  id: string;
  status: TxStatus;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  chainId: number;
  createdAt: number;
  completedAt?: number;
  txHash?: string;
  /** ERC-4337 operation hash while a token-funded transaction is pending. */
  userOperationHash?: string;
  /** Token used to settle gas through an ERC-4337 paymaster. */
  feePaymentToken?: string;
  /** Signed bytes crossed the RPC boundary without an authoritative reply. */
  broadcastUncertain?: boolean;
  error?: string;
  jobId?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase";
  functionName?: string;
  gasData?: GasData;
  swapMeta?: SwapMeta;
  transferMeta?: TransferMeta;
  clearSignedMeta?: ClearSignedMeta;
  /** One origin per decoded ERC-7821 call in a cross-dapp batch. */
  batchCallOrigins?: TxCallOrigin[];
  forceInclusionMeta?: ForceInclusionMeta;
  /** Cross-chain bridge metadata. Present only on source-chain bridge rows. */
  bridge?: BridgeMeta;
  /** Source-chain post-confirm flow snapshot. */
  assetChanges?: AssetChangeRecord;
  /** Optional bridge destination flow snapshot. */
  destAssetChanges?: AssetChangeRecord;
  /** Split wallet_sendCalls membership. */
  parentBundleId?: string;
  bundleIndex?: number;
  /** Standalone EIP-7702 self-call intent captured before confirmation. */
  delegation7702Meta?: {
    targetDelegate: `0x${string}`;
    kind: "revoke" | "setDelegate";
  };
  /** Disable-delegation display snapshot committed only after receipt success. */
  erc7715PermissionRevokeMeta?: Erc7715PermissionRevokeMeta;
  /** Stable account identity captured before any post-confirm side effects. */
  accountId?: string;
  /** No note, commitment, label, index, proof, or recovery material. */
  privacyShieldMeta?: PrivacyShieldHistoryMeta;
  /** No operation ID, commitment, label, proof, or recovery material. */
  privacyRagequitMeta?: PrivacyRagequitHistoryMeta;
  /** The encrypted Unshield operation owns its Private Activity presentation. */
  privacyUnshieldMeta?: PrivacyUnshieldHistoryMeta;
}
