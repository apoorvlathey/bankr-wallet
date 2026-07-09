import {
  ZERION_API_BASE,
  fetchZerionJson,
  normalizeZerionNextUrl,
} from "./zerionClient";
import { fetchZerionChainIds } from "./zerionChains";
import { normalizeZerionPositions } from "./zerionNormalizer";
import type { PortfolioProvider, ProviderResult } from "./types";
import type { ZerionPosition, ZerionPositionsResponse } from "./zerionTypes";

const MAX_POSITION_PAGES = 50;

export const zerionProvider: PortfolioProvider = {
  name: "zerion",

  isConfigured() {
    return !!process.env.ZERION_API_KEY;
  },

  async fetch(address): Promise<ProviderResult> {
    const apiKey = process.env.ZERION_API_KEY!;
    const [chainIds, positions] = await Promise.all([
      fetchZerionChainIds(apiKey),
      fetchAllPositions(address, apiKey),
    ]);

    return normalizeZerionPositions(positions, chainIds);
  },
};

async function fetchAllPositions(
  address: string,
  apiKey: string,
): Promise<ZerionPosition[]> {
  const params = new URLSearchParams({
    currency: "usd",
    "filter[positions]": "no_filter",
    "filter[trash]": "only_non_trash",
    sort: "-value",
  });
  let url: string | null =
    `${ZERION_API_BASE}/wallets/${encodeURIComponent(address)}/positions/?${params.toString()}`;
  const positions: ZerionPosition[] = [];

  for (let page = 0; url && page < MAX_POSITION_PAGES; page += 1) {
    const data = await fetchZerionJson<ZerionPositionsResponse>(
      url,
      apiKey,
      60,
    );
    positions.push(...(data.data || []));
    url = normalizeZerionNextUrl(data.links?.next);
  }

  if (url) {
    throw new Error(
      `Zerion positions pagination exceeded ${MAX_POSITION_PAGES} pages`,
    );
  }

  return positions;
}
