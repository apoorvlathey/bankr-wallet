import { NextRequest, NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

/** In-memory cache keyed by chainId. */
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get("chainId");

  if (!chainId || !/^\d+$/.test(chainId)) {
    return NextResponse.json(
      { error: "Missing or invalid chainId" },
      { status: 400 },
    );
  }

  const cached = cache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const params = new URLSearchParams({
      chainIds: chainId,
      list: "full",
    });

    const response = await fetch(
      `${BUNGEE_API_URL}/v3/swap/tokens/list?${params.toString()}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      if (cached) {
        return NextResponse.json(cached.data, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      }
      return NextResponse.json(data, { status: 502 });
    }

    cache.set(chainId, { data, fetchedAt: Date.now() });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Socket tokens API error:", error);
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
