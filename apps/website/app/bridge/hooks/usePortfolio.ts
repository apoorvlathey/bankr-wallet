import { useEffect, useState } from "react";
import type { PortfolioToken } from "../../api/portfolio/providers/types";

interface PortfolioResponse {
  tokens: PortfolioToken[];
  totalValueUsd?: number;
  error?: string;
}

const cache = new Map<string, { data: PortfolioToken[]; fetchedAt: number }>();
const inFlight = new Map<string, Promise<PortfolioToken[]>>();
const CACHE_TTL = 60_000; // 60s — matches the route's Cache-Control

async function fetchPortfolio(address: string): Promise<PortfolioToken[]> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const response = await fetch(
      `/api/portfolio?address=${encodeURIComponent(address)}`,
    );
    const data = (await response.json()) as PortfolioResponse;
    if (!response.ok) {
      throw new Error(data.error || `Portfolio fetch failed: ${response.status}`);
    }
    const tokens = data.tokens ?? [];
    cache.set(key, { data: tokens, fetchedAt: Date.now() });
    return tokens;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Fetches the user's portfolio (multi-chain) via /api/portfolio.
 *  Returns the full token list — callers filter by chainId. */
export function usePortfolio(address: string | undefined) {
  const [tokens, setTokens] = useState<PortfolioToken[]>(
    address ? (cache.get(address.toLowerCase())?.data ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setTokens([]);
      setError(null);
      return;
    }

    let alive = true;
    setIsLoading(true);
    fetchPortfolio(address)
      .then((t) => {
        if (alive) {
          setTokens(t);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [address]);

  return { tokens, isLoading, error };
}
