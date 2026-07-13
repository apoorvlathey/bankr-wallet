import { WALLETCHAN_PORTFOLIO_API } from "@/constants/externalUrls";
import { fetchTextBounded } from "./boundedHttpResponse";
import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";

const PORTFOLIO_API_URL = WALLETCHAN_PORTFOLIO_API;
const PORTFOLIO_TIMEOUT_MS = 15_000;
const PORTFOLIO_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

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

  const { response, text } = await fetchTextBounded(
    url,
    { method: "GET", signal },
    {
      timeoutMs: PORTFOLIO_TIMEOUT_MS,
      maxBytes: PORTFOLIO_RESPONSE_MAX_BYTES,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Portfolio fetch failed (${response.status}): ${text.slice(0, 1_000)}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Portfolio API returned invalid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Portfolio API returned an invalid response");
  }
  const portfolio = payload as PortfolioResponse;
  if (Array.isArray(portfolio.defiPositions)) {
    for (const position of portfolio.defiPositions) {
      if (!position || typeof position !== "object") continue;
      const safeSiteUrl = sanitizeExternalNavigationUrl(position.siteUrl);
      position.siteUrl = safeSiteUrl ?? undefined;
    }
  }
  return portfolio;
}
