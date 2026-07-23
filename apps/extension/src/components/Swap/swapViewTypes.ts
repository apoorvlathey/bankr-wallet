import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { SwapQuoteResponse, TokenInfo } from "@/chrome/swapApi";
import type { SwapTxEntry } from "@/chrome/txHandlers";

export type SwapAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "ledger"
  | "impersonator"
  | "safe";

export type PreparedSwapTxEntry = Omit<SwapTxEntry, "tx"> & {
  tx: Omit<SwapTxEntry["tx"], "to" | "data" | "value"> & {
    to: string;
    data: string;
    value: string;
  };
};

export interface SwapConfirmationProps {
  requestId: string;
  transactions: PreparedSwapTxEntry[];
  sellToken: PortfolioToken;
  sellAmount: string;
  sellUsd: number;
  buyTokenInfo: TokenInfo;
  buyAmount: string;
  buyTokenDecimals: number;
  buyTokenLogoURI?: string;
  /**
   * True when the buy token is the destination chain's native asset. Lets
   * the receive-row icon fall back through the native-asset logo resolver when
   * no per-token logo is available. ETH-native chains still render ETH, not
   * the chain badge.
   */
  isBuyNative?: boolean;
  buyUsd: number;
  chainId: number;
  chainName: string;
  fromAddress: string;
  accountId?: string;
  accountType: SwapAccountType;
  isBatched: boolean;
  batchedTx?: { to: string; data: string; value: string };
  /**
   * For PK/Seed atomic-7702 swaps: the delegate the EOA will authorize this
   * batch under, but ONLY when the EOA isn't already onchain-delegated to it
   * (i.e., `batchPlan.needsAuthorization === true`). Forwarded to
   * `MultiTxGasEstimateDisplay` so the gas estimator can apply the same
   * `stateOverride` trick used by `BatchTransactionConfirmation`. Leave
   * undefined for Bankr atomic (server-side gas) and for PK/SP atomic where
   * the EOA is already delegated — plain `estimateGas` is more RPC-robust
   * there.
   */
  eip7702Delegate?: `0x${string}`;
  /**
   * When the EOA is already delegated to a non-7821 contract on this chain
   * (e.g. another wallet's delegate), the resolver returns the WalletChan
   * default for `eip7702Delegate` AND populates this field with the current
   * onchain delegation so the banner can render the "Replacing existing
   * delegation" variant. Undefined / null = fresh setup.
   */
  eip7702OnchainDelegate?: `0x${string}` | null;
  onConfirm: (
    feePaymentToken: "native" | `0x${string}`,
    feePaymentQuoteId: string | null,
  ) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /**
   * Per-call gas estimates picked from the tier picker. Fired by
   * MultiTxGasEstimateDisplay whenever the user picks a tier or edits the
   * Custom inputs. Parent uses these as the gas params for each non-atomic
   * swap tx (approve / swap). Bankr atomic swaps ignore this — Bankr API
   * computes gas server-side.
   */
  onGasEstimates?: (estimates: import("@/chrome/gasEstimation").GasEstimate[]) => void;
  /** Bubbles invalid Custom-tier state up so the parent disables Confirm. */
  onValidityChange?: (valid: boolean) => void;
  /** Disables Confirm Swap when the gas editor is in an inconsistent state. */
  isNativeGasValid?: boolean;
  /** Disables every execution mode (for example a view-only account). */
  isConfirmDisabled?: boolean;
  /**
   * Bridge-mode metadata. When set, this screen renders the cross-chain
   * variant: title flips to "Confirm Bridge", buy row shows the destination
   * chain badge alongside the buy token, and the receipt includes the
   * Socket route name + estimated time. Gas plumbing is unchanged — the
   * underlying source tx still uses MultiTxGasEstimateDisplay's tier picker.
   */
  bridgeMeta?: {
    destinationChainId: number;
    destinationChainName: string;
    routeName?: string;
    estimatedTime?: number;
    /** Source chain native USD price — when provided, the Bridge Fee row
     *  appends a dollar equivalent so users can size the protocol cost. */
    sourceNativePriceUsd?: number;
  };
}

export interface SwapViewProps {
  fromAddress: string;
  /** Active account ID used to resolve EIP-7702 support for local accounts. */
  accountId?: string;
  accountType: SwapAccountType;
  chainId: number;
  chainName: string;
  onBack: () => void;
  onSwapInitiated: () => void;
  /** Opens the Safe request created from a reviewed same-chain swap. */
  onSafeProposalCreated?: (proposalId: string) => void;
  onChainChange: (chainName: string) => void;
  initialBuyToken?: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
  };
  initialSellToken?: PortfolioToken;
}

export interface DestinationNativeInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  chainName: string;
}

export interface PreparedAccountLock {
  accountId: string;
  fromAddress: string;
}

export interface PreparedDelegation {
  delegate: `0x${string}`;
  needsAuth: boolean;
  onchainDelegate: `0x${string}` | null;
}

export interface PreparedSwapPlan {
  transactions: PreparedSwapTxEntry[];
  batchTx: { to: string; data: string; value: string } | null;
  delegation: PreparedDelegation | null;
  quote: SwapQuoteResponse;
}
