export interface PortfolioToken {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUsd: number;
  valueUsd: number;
  logoUrl?: string;
}

export interface DefiAsset {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  valueUsd: number;
  logoUrl?: string;
}

export interface DefiPosition {
  protocol: string;
  protocolLogo?: string;
  chainId: number;
  type: string;
  name: string;
  valueUsd: number;
  siteUrl?: string;
  assets: DefiAsset[];
  rewardAssets: DefiAsset[];
}

export interface PortfolioResponse {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  tokenCount?: number;
  omittedTokenCount?: number;
  omittedTokenValueUsd?: number;
  omittedTokenValueUsdByChain?: Record<string, number>;
  truncated?: boolean;
  source?: string;
}

export interface DecodedPortfolioResponse extends PortfolioResponse {
  tokenCount: number;
  omittedTokenCount: number;
  omittedTokenValueUsd: number;
  omittedTokenValueUsdByChain: Record<string, number>;
  truncated: boolean;
}

export interface PortfolioSummaryResponse {
  totalValueUsd: number;
}
