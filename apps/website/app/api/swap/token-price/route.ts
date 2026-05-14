import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

const COINGECKO_PLATFORM_IDS: Record<string, string> = {
  "1": "ethereum",
  "42161": "arbitrum-one",
  "8453": "base",
  "56": "binance-smart-chain",
  "137": "polygon-pos",
  "130": "unichain",
};

/**
 * GeckoTerminal network slugs. Strict superset of the CoinGecko coverage —
 * GeckoTerminal derives prices from onchain DEX liquidity, so it picks up
 * newer / lower-cap / DEX-only tokens that the CoinGecko `/simple/token_price`
 * endpoint returns nothing for. Also supports MegaETH which CoinGecko's
 * platform map doesn't cover at all.
 */
const GECKOTERMINAL_NETWORK_IDS: Record<string, string> = {
  "1": "eth",
  "42161": "arbitrum",
  "8453": "base",
  "56": "bsc",
  "137": "polygon_pos",
  "130": "unichain",
  "4326": "megaeth",
};

/** In-memory cache: "chainId:address" → { priceUsd, fetchedAt } */
const cache = new Map<string, { priceUsd: number; fetchedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function fetchCoinGeckoPrice(
  platformId: string,
  address: string,
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platformId}?contract_addresses=${address}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data[address]?.usd ?? 0);
  } catch {
    return 0;
  }
}

async function fetchGeckoTerminalPrice(
  network: string,
  address: string,
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/simple/networks/${network}/token_price/${address}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const priceStr = data?.data?.attributes?.token_prices?.[address];
    return priceStr ? Number(priceStr) : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get("chainId");
  const address = searchParams.get("address");

  if (!chainId || !address) {
    return NextResponse.json(
      { error: "Missing chainId or address" },
      { status: 400 },
    );
  }

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid address" },
      { status: 400 },
    );
  }

  const platformId = COINGECKO_PLATFORM_IDS[chainId];
  const gtNetwork = GECKOTERMINAL_NETWORK_IDS[chainId];
  if (!platformId && !gtNetwork) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainId}` },
      { status: 400 },
    );
  }

  const addr = address.toLowerCase();
  const cacheKey = `${chainId}:${addr}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ priceUsd: cached.priceUsd });
  }

  let priceUsd = 0;
  if (platformId) {
    priceUsd = await fetchCoinGeckoPrice(platformId, addr);
  }
  if (priceUsd === 0 && gtNetwork) {
    priceUsd = await fetchGeckoTerminalPrice(gtNetwork, addr);
  }

  if (priceUsd === 0 && cached) {
    // Both upstream calls failed/empty; serve stale cache rather than 0.
    return NextResponse.json({ priceUsd: cached.priceUsd });
  }

  cache.set(cacheKey, { priceUsd, fetchedAt: Date.now() });
  return NextResponse.json({ priceUsd });
}
