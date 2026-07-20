import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { SwapQuoteResponse } from "@/chrome/swapApi";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";

export type SwapAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "impersonator"
  | "safe";

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
