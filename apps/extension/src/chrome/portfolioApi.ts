import { WALLETCHAN_PORTFOLIO_API } from "@/constants/externalUrls";

const PORTFOLIO_API_URL = WALLETCHAN_PORTFOLIO_API;

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
}

export async function fetchPortfolio(
  address: string,
  signal?: AbortSignal,
): Promise<PortfolioResponse> {
  const url = `${PORTFOLIO_API_URL}?address=${encodeURIComponent(address)}`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Portfolio fetch failed (${response.status}): ${text}`);
  }

  return response.json();
}
