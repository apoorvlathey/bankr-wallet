import { NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

/**
 * Per-chain brand background color for the icon chip rendered in the
 * bridge picker. Bungee's icons are a mix of opaque-circular logos and
 * dark-glyph-on-transparent SVGs; the latter vanish on dark UI surfaces
 * unless we paint a backing color behind them.
 *
 * Curated by chainId so it survives Bungee renames. Extend this map as
 * specific chains surface visual issues — leaving a chain unmapped means
 * the UI renders the icon as-is (no backdrop) which is the right default
 * for any opaque-on-its-own logo. CSS color string ("white", "#FF6600", …).
 */
const CHAIN_BG_COLOR: Record<number, string> = {
  // Add curated colors here as needed, e.g.:
  // 59144: "white",   // Linea (dark glyph on transparent)
  // 324: "white",     // zkSync Era
};

interface BungeeChain {
  chainId: number;
  [key: string]: unknown;
}

function enrich(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const obj = data as { result?: unknown };
  if (!Array.isArray(obj.result)) return data;
  const enriched = obj.result.map((chain) => {
    if (!chain || typeof chain !== "object") return chain;
    const c = chain as BungeeChain;
    const bgColor = CHAIN_BG_COLOR[c.chainId];
    return bgColor ? { ...c, bgColor } : c;
  });
  return { ...obj, result: enriched };
}

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
      `${BUNGEE_API_URL}/v3/swap/supported-chains`,
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

    const enriched = enrich(data);
    cache = { data: enriched, fetchedAt: Date.now() };
    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Socket chains API error:", error);
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
