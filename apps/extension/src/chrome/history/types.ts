import type { TransactionParams } from "../bankr/submission";
import type {
  Erc7715PermissionRevokeMeta,
  TransactionReplacementMeta,
} from "../requests/pendingTxStorage";
import type { ForceInclusionMeta } from "./forceInclusionTypes";
export type { ForceInclusionMeta } from "./forceInclusionTypes";
import type { ClearSignedMeta } from "./clearSignedTypes";
import type {
  PrivacyRagequitHistoryMeta,
  PrivacyShieldHistoryMeta,
  PrivacyUnshieldHistoryMeta,
} from "./privacyTypes";
export type { ClearSignedMeta } from "./clearSignedTypes";
export type {
  PrivacyRagequitHistoryMeta,
  PrivacyShieldHistoryMeta,
  PrivacyUnshieldHistoryMeta,
} from "./privacyTypes";

export type TxStatus = "processing" | "pending" | "success" | "failed" | "dropped";
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

/** One ERC-20 transfer involving the observed account. Internal pool routing
 * is excluded by the parser before this public snapshot is persisted. */
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

/** One confirmed ERC-721 or ERC-1155 transfer involving the observed account. */
export interface NftTransferRecord {
  /** Lowercased NFT contract. */
  token: string;
  direction: "in" | "out";
  /** Lowercased other side of the transfer. */
  counterparty: string;
  standard: "erc721" | "erc1155";
  tokenId: string;
  /** ERC-721 is always 1; ERC-1155 preserves the emitted quantity. */
  amount: string;
  /** Resolved only in renderer memory; never persisted in transaction history. */
  collectionName?: string;
  symbol?: string;
  metadata?: {
    name?: string;
    image?: string;
  };
  /** Renderer-only lazy metadata state; stripped by durable history compaction. */
  metadataLoading?: boolean;
}

/** Post-confirm asset-change snapshot for one chain leg. */
export interface AssetChangeRecord {
  /** Additive receipt parser version; missing means the legacy ERC-20-only parser. */
  version?: 2;
  /** Mined block number as a decimal string. */
  blockNumber: string;
  /**
   * Signed native flow after adding sender gas back. Undefined when historical
   * balances cannot be resolved; consumers then hide only the native row.
   */
  nativeDelta?: string;
  erc20Transfers: AssetTransferRecord[];
  nftTransfers?: NftTransferRecord[];
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
  calldataSelector?: string;
  detailsIncomplete?: boolean;
  /** ERC-4337 operation hash while a token-funded transaction is pending. */
  userOperationHash?: string;
  /** Token used to settle gas through an ERC-4337 paymaster. */
  feePaymentToken?: string;
  /** Signed bytes crossed the RPC boundary without an authoritative reply. */
  broadcastUncertain?: boolean;
  error?: string;
  jobId?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "ledger" | "impersonator";
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
  replacement?: TransactionReplacementMeta;
  replacedByTxId?: string;
  accountId?: string;
  /** No note, commitment, label, index, proof, or recovery material. */
  privacyShieldMeta?: PrivacyShieldHistoryMeta;
  /** No operation ID, commitment, label, proof, or recovery material. */
  privacyRagequitMeta?: PrivacyRagequitHistoryMeta;
  /** The encrypted Unshield operation owns its Private Activity presentation. */
  privacyUnshieldMeta?: PrivacyUnshieldHistoryMeta;
}
