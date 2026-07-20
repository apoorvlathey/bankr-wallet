import { WALLETCHAN_PORTFOLIO_API } from "@/constants/externalUrls";
import { fetchTextBounded } from "../network/boundedHttp";
import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";
import { decodePortfolioResponse } from "./responsePolicy";
import type {
  DecodedPortfolioResponse,
  PortfolioSummaryResponse,
} from "./apiTypes";

export type {
  DecodedPortfolioResponse,
  DefiAsset,
  DefiPosition,
  PortfolioResponse,
  PortfolioSummaryResponse,
  PortfolioToken,
} from "./apiTypes";

const PORTFOLIO_API_URL = WALLETCHAN_PORTFOLIO_API;
const PORTFOLIO_TIMEOUT_MS = 15_000;
const PORTFOLIO_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;

export async function fetchPortfolio(
  address: string,
  signal?: AbortSignal,
): Promise<DecodedPortfolioResponse> {
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
  const portfolio = decodePortfolioResponse(payload);
  for (const position of portfolio.defiPositions) {
    const safeSiteUrl = sanitizeExternalNavigationUrl(position.siteUrl);
    position.siteUrl = safeSiteUrl ?? undefined;
  }
  return portfolio;
}

/** Total-only projection for screens that never render portfolio rows. */
export async function fetchPortfolioSummary(
  address: string,
  signal?: AbortSignal,
): Promise<PortfolioSummaryResponse> {
  const url = `${PORTFOLIO_API_URL}?address=${encodeURIComponent(address)}&summary=1`;
  const { response, text } = await fetchTextBounded(
    url,
    { method: "GET", signal },
    {
      timeoutMs: PORTFOLIO_TIMEOUT_MS,
      // Older deployments ignore `summary=1`; keep the compatibility ceiling
      // while discarding their token rows immediately after parsing.
      maxBytes: PORTFOLIO_RESPONSE_MAX_BYTES,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Portfolio summary fetch failed (${response.status}): ${text.slice(0, 1_000)}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Portfolio API returned invalid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Portfolio API returned an invalid summary");
  }
  const totalValueUsd = Number(
    (payload as { totalValueUsd?: unknown }).totalValueUsd,
  );
  if (!Number.isFinite(totalValueUsd) || totalValueUsd < 0) {
    throw new Error("Portfolio API returned an invalid summary");
  }
  return { totalValueUsd };
}
