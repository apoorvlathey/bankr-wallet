/**
 * Socket Swap V3 API types, kept under the historical `bungee` export path.
 * Covers /quote, /status, /supported-chains, /tokens/list.
 * Reference: https://docs.socket.tech
 *
 * Shared across the website (`apps/website/app/bridge/**`) and the extension
 * (`apps/extension/src/chrome/bridgeApi.ts`).
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

export interface BungeeNativeCurrency {
  address?: string;
  icon?: string;
  logoURI?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  minNativeCurrencyForGas?: string;
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
  gas?: string;
  gasPrice?: string;
}

export interface BungeeManualRoute {
  output: BungeeAmountAndUsd;
  quoteId: string;
  quoteExpiry?: number;
  expiresAt?: number;
  gasFee?: {
    gasAmount?: string;
    feesInUsd?: number;
    gasToken?: BungeeToken;
    gasLimit?: string;
    gasPrice?: string;
    estimatedFee?: string;
    feeInUsd?: number;
  };
  routeDetails?: {
    name?: string;
    logoURI?: string;
  };
  estimatedTime?: number;
  approvalData?: BungeeApprovalData | null;
  txData?: BungeeTxData;
  /** Raw Socket V3 route for forward-compatible fields we do not render yet. */
  socketRoute?: Record<string, unknown>;
}

/** Legacy Bungee auto-mode route. Socket V3 clients should use manualRoutes[].txData. */
export interface BungeeAutoRoute {
  userOp?: string;
  requestHash?: string;
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
  gasFee?: {
    gasToken?: BungeeToken;
    gasLimit?: string;
    gasPrice?: string;
    estimatedFee?: string;
    feeInUsd?: number;
  };
  routeDetails?: {
    name?: string;
    logoURI?: string;
  };
  txData?: BungeeTxData;
  estimatedTime?: number;
}

export interface BungeeQuoteResult {
  input: BungeeAmountAndUsd;
  /** Socket Swap V3's native route array. */
  routes?: Record<string, unknown>[];
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

export interface BungeeStatusEntry {
  /** Overall request hash. */
  hash?: string;
  /** Socket Swap V3 quote id. Stored in `hash` too for legacy callers. */
  quoteId?: string;
  status?: string;
  statusCode?: string;
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
  /** Raw Socket V3 status object for forward-compatible fields. */
  socketStatus?: Record<string, unknown>;
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
  currency?: BungeeNativeCurrency;
  explorers?: string[];
  /** Some chains may be disabled at the routing layer. */
  sendingEnabled?: boolean;
  receivingEnabled?: boolean;
  /** Optional brand background color for the chain logo chip. Set by our
   *  `/api/bridge/chains` proxy when a chain's icon needs a specific
   *  backdrop (e.g., dark-glyph-on-transparent SVGs need a light fill).
   *  Free-form CSS color string ("white", "#000", etc.). When unset, the
   *  UI renders the icon as-is. */
  bgColor?: string;
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
