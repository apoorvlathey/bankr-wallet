import { NextRequest, NextResponse } from "next/server";

/**
 * CoinGecko platform IDs keyed by chainId.
 * Mirrors the extension's price/logo metadata map, including custom-network
 * chains that 0x supports even when they are not built-in wallet networks.
 */
const PLATFORM_IDS: Record<number, string> = {
  1: "ethereum",
  42161: "arbitrum-one",
  8453: "base",
  56: "binance-smart-chain",
  137: "polygon-pos",
  130: "unichain",
  43114: "avalanche",
};

const SUPPORTED_CHAIN_IDS = new Set(Object.keys(PLATFORM_IDS).map(Number));

/** In-memory cache: chainId → { data, fetchedAt } */
const cache = new Map<
  number,
  { data: TokenListResponse; fetchedAt: number }
>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CoinGeckoToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

interface TokenListResponse {
  tokens: Array<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
  }>;
  chainId: number;
  updatedAt: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chainIdStr = searchParams.get("chainId");

  if (!chainIdStr || !/^\d+$/.test(chainIdStr)) {
    return NextResponse.json(
      { error: "Missing or invalid chainId parameter" },
      { status: 400 },
    );
  }

  const chainId = parseInt(chainIdStr, 10);

  if (!SUPPORTED_CHAIN_IDS.has(chainId)) {
    return NextResponse.json(
      { error: `Swap not supported for chainId ${chainId}` },
      { status: 400 },
    );
  }

  // Check cache
  const cached = cache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  const platformId = PLATFORM_IDS[chainId];

  try {
    const response = await fetch(
      `https://tokens.coingecko.com/${platformId}/all.json`,
      { signal: AbortSignal.timeout(15_000) },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `CoinGecko API error: ${response.status}` },
        { status: 502 },
      );
    }

    const raw = await response.json();
    const tokens: CoinGeckoToken[] = raw.tokens ?? [];

    const data: TokenListResponse = {
      tokens: tokens.map((t) => ({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        decimals: t.decimals,
        logoURI: t.logoURI,
      })),
      chainId,
      updatedAt: new Date().toISOString(),
    };

    // Update cache
    cache.set(chainId, { data, fetchedAt: Date.now() });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Token list fetch error:", error);
    // Return stale cache if available
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch token list" },
      { status: 502 },
    );
  }
}
