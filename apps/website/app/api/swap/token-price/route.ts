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

/** In-memory cache: "chainId:address" → { priceUsd, fetchedAt } */
const cache = new Map<string, { priceUsd: number; fetchedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

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
  if (!platformId) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainId}` },
      { status: 400 },
    );
  }

  const cacheKey = `${chainId}:${address.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ priceUsd: cached.priceUsd });
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platformId}?contract_addresses=${address}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) {
      // Return stale cache if available
      if (cached) return NextResponse.json({ priceUsd: cached.priceUsd });
      return NextResponse.json(
        { error: `CoinGecko API error: ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const priceUsd: number =
      data[address.toLowerCase()]?.usd ?? 0;

    cache.set(cacheKey, { priceUsd, fetchedAt: Date.now() });

    return NextResponse.json({ priceUsd });
  } catch {
    if (cached) return NextResponse.json({ priceUsd: cached.priceUsd });
    return NextResponse.json(
      { error: "Failed to fetch token price" },
      { status: 502 },
    );
  }
}
