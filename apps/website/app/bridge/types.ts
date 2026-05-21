/**
 * Bungee API types — covers /quote, /build-tx, /submit, /status, /supported-chains, /tokens/list.
 * Reference: https://docs.bungee.exchange
 */

/** Bungee uses an all-lowercase native sentinel; the universal address is mixed-case. */
export const BUNGEE_NATIVE_TOKEN =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Status codes returned by /status. */
export enum BungeeStatusCode {
  PENDING = 0,
  ASSIGNED = 1,
  EXTRACTED = 2,
  FULFILLED = 3,
  SETTLED = 4,
  EXPIRED = 5,
  CANCELLED = 6,
  REFUNDED = 7,
}

export const TERMINAL_STATUS_CODES = new Set<number>([
  BungeeStatusCode.FULFILLED,
  BungeeStatusCode.SETTLED,
  BungeeStatusCode.EXPIRED,
  BungeeStatusCode.CANCELLED,
  BungeeStatusCode.REFUNDED,
]);

export interface BungeeToken {
  chainId?: number;
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  icon?: string;
  logoURI?: string;
}

export interface BungeeAmountAndUsd {
  token: BungeeToken;
  amount: string;
  priceInUsd?: number;
  valueInUsd?: number;
  minAmountOut?: string;
}

export interface BungeeApprovalData {
  amount: string;
  tokenAddress: string;
  spenderAddress: string;
  userAddress: string;
}

export interface BungeeTxData {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export interface BungeeManualRoute {
  output: BungeeAmountAndUsd;
  quoteId: string;
  quoteExpiry?: number;
  gasFee?: {
    gasAmount?: string;
    feesInUsd?: number;
  };
  routeDetails?: {
    name?: string;
    logoURI?: string;
  };
  estimatedTime?: number;
  approvalData?: BungeeApprovalData | null;
  txData?: BungeeTxData;
}

/** Auto-mode route: user signs the Permit2 EIP-712 payload and we POST it to /submit. */
export interface BungeeAutoRoute {
  output: BungeeAmountAndUsd;
  quoteId: string;
  quoteExpiry?: number;
  signTypedData?: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType?: string;
    message: Record<string, unknown>;
    value?: Record<string, unknown>;
  };
  approvalData?: BungeeApprovalData | null;
  requestType?: string;
  request?: Record<string, unknown>;
  routeDetails?: {
    name?: string;
  };
  estimatedTime?: number;
}

export interface BungeeQuoteResult {
  input: BungeeAmountAndUsd;
  manualRoutes: BungeeManualRoute[];
  autoRoute?: BungeeAutoRoute | null;
  quoteId?: string;
  quoteExpiry?: number;
}

export interface BungeeQuoteResponse {
  success: boolean;
  result: BungeeQuoteResult;
  /** Added by our server proxy from resolveFeeBps(). */
  isPremiumFee?: boolean;
  /** Added by our server proxy. */
  feeBps?: string;
}

export interface BungeeBuildTxResult {
  txData: BungeeTxData;
  approvalData?: BungeeApprovalData | null;
  userOp?: string;
}

export interface BungeeBuildTxResponse {
  success: boolean;
  result: BungeeBuildTxResult;
}

export interface BungeeSubmitResponse {
  success: boolean;
  result: {
    requestHash: string;
  };
}

export interface BungeeStatusEntry {
  /** Overall request hash. */
  hash?: string;
  bungeeStatusCode: BungeeStatusCode;
  originData?: {
    txHash?: string;
    originChainId?: number;
    status?: string;
    userAddress?: string;
    timestamp?: number;
  };
  destinationData?: {
    txHash?: string;
    destinationChainId?: number;
    receiverAddress?: string;
    status?: string;
    timestamp?: number;
  };
  /** `null` when no refund happened. */
  refund?: {
    txHash?: string;
    chainId?: number;
    originChainId?: number;
  } | null;
  routeDetails?: {
    name?: string;
    logoURI?: string;
  };
}

export interface BungeeStatusResponse {
  success: boolean;
  result: BungeeStatusEntry[];
}

export interface BungeeChain {
  chainId: number;
  name: string;
  icon?: string;
  logoURI?: string;
  /** Some chains may be disabled at the routing layer. */
  sendingEnabled?: boolean;
  receivingEnabled?: boolean;
}

export interface BungeeChainsResponse {
  success: boolean;
  result: BungeeChain[];
}

/** Bungee's /tokens/list returns tokens keyed by chainId string. */
export interface BungeeTokenListResponse {
  success: boolean;
  result: Record<string, BungeeToken[]>;
}
