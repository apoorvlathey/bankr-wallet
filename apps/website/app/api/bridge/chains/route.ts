import { NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

/** In-memory cache shared across requests on the same Vercel instance. */
let cache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/api/v1/supported-chains`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      // Fall back to stale cache if we have one
      if (cache) {
        return NextResponse.json(cache.data, {
          headers: { "Cache-Control": "public, max-age=300" },
        });
      }
      return NextResponse.json(data, { status: 502 });
    }

    cache = { data, fetchedAt: Date.now() };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Bungee chains API error:", error);
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch supported chains" },
      { status: 502 },
    );
  }
}
