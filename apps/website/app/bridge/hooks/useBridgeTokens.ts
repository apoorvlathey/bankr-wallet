import { useEffect, useState } from "react";
import type { BungeeToken, BungeeTokenListResponse } from "../types";

const cache = new Map<number, BungeeToken[]>();
const inFlight = new Map<number, Promise<BungeeToken[]>>();

async function fetchTokens(chainId: number): Promise<BungeeToken[]> {
  const cached = cache.get(chainId);
  if (cached) return cached;

  const existing = inFlight.get(chainId);
  if (existing) return existing;

  const promise = (async () => {
    const response = await fetch(`/api/bridge/tokens?chainId=${chainId}`);
    const data = (await response.json()) as BungeeTokenListResponse;
    if (!response.ok || !data.success) {
      throw new Error("Failed to load tokens");
    }
    // Bungee returns { result: { "<chainId>": Token[] } }
    const byChain = data.result ?? {};
    const tokens = byChain[String(chainId)] ?? [];
    cache.set(chainId, tokens);
    return tokens;
  })().finally(() => {
    inFlight.delete(chainId);
  });

  inFlight.set(chainId, promise);
  return promise;
}

export function useBridgeTokens(chainId?: number) {
  const [tokens, setTokens] = useState<BungeeToken[]>(
    chainId ? (cache.get(chainId) ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chainId) {
      setTokens([]);
      return;
    }
    const cached = cache.get(chainId);
    if (cached) {
      setTokens(cached);
      return;
    }

    let alive = true;
    setIsLoading(true);
    fetchTokens(chainId)
      .then((t) => {
        if (alive) {
          setTokens(t);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setTokens([]);
        }
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [chainId]);

  return { tokens, isLoading, error };
}
