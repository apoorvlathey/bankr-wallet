import { NextRequest, NextResponse } from "next/server";
import { resolveMetaMaskTokenIcon } from "./metamaskTokenIcon";
import { PLATFORM_IDS } from "./platformIds";

/**
 * Mirrors the extension's price/logo metadata map, including custom-network
 * chains that 0x supports even when they are not built-in wallet networks.
 */
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
  const tokenAddress = searchParams.get("address");

  if (!chainIdStr || !/^\d+$/.test(chainIdStr)) {
    return NextResponse.json(
      { error: "Missing or invalid chainId parameter" },
      { status: 400 },
    );
  }

  const chainId = parseInt(chainIdStr, 10);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return NextResponse.json(
      { error: "Invalid chainId parameter" },
      { status: 400 },
    );
  }

  if (tokenAddress !== null) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 },
      );
    }
    const logoUrl = await resolveMetaMaskTokenIcon(chainId, tokenAddress);
    return NextResponse.json(
      { logoUrl },
      {
        headers: {
          "Cache-Control": logoUrl
            ? "public, max-age=3600"
            : "public, max-age=300",
        },
      },
    );
  }

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
