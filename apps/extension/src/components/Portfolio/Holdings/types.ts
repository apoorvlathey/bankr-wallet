import type { DefiPosition, PortfolioToken } from "@/chrome/portfolio/api";
import type { NetworksInfo, RpcHealthReport } from "@/types";

export interface LoadPortfolioOptions {
  forceSnapshot?: boolean;
  forceRefreshTokenKeys?: Set<string>;
  forceRefreshTokens?: PortfolioToken[];
  suppressSkeleton?: boolean;
}

export interface TokenHoldingsStateSnapshot {
  totalValueUsd: number;
  loading: boolean;
  hideValue: boolean;
  toggleHideValue: () => void;
  refresh: (options?: LoadPortfolioOptions) => Promise<void>;
  tokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
  apiUnavailable: boolean;
  chainTotals: ReadonlyMap<number, number>;
}

export interface TokenHoldingsProps {
  address: string;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  hideHeader?: boolean;
  hideCard?: boolean;
  onRpcIssuesChange?: (report: RpcHealthReport) => void;
  filterChainId?: number | null;
  onShowAllNetworks?: () => void;
  searchQuery?: string;
  onSnapshotsChanged?: () => void;
  /** Groups canonical ETH, USDC, and USDT rows across networks by default. */
  unifyBalances?: boolean;
  view?: "all" | "assets" | "positions";
  onStateChange?: (state: TokenHoldingsStateSnapshot) => void;
}

export type AssetDisplayRow =
  | { kind: "token"; token: PortfolioToken; valueUsd: number }
  | {
      kind: "aggregate";
      symbol: "ETH" | "USDC" | "USDT";
      tokens: PortfolioToken[];
      valueUsd: number;
    };

export interface HoldingsSnapshot {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
  onchainFetchedTokenKeys: Set<string>;
  rpcIssueChainIds: number[];
  apiUnavailable: boolean;
  timestamp: number;
}

export interface AssetRowPresentationProps {
  customTokenKeys: Set<string>;
  networksInfo: NetworksInfo;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onEditToken: (token: PortfolioToken) => void;
  onHideToken: (token: PortfolioToken) => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  hideValue: boolean;
  formatUsd: (value: number) => string;
}
