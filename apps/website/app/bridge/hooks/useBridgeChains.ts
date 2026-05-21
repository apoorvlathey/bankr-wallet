import { useEffect, useState } from "react";
import type { BungeeChain, BungeeChainsResponse } from "../types";

let cachedChains: BungeeChain[] | null = null;
let inFlight: Promise<BungeeChain[]> | null = null;

async function fetchChains(): Promise<BungeeChain[]> {
  if (cachedChains) return cachedChains;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await fetch("/api/bridge/chains");
    const data = (await response.json()) as BungeeChainsResponse;
    if (!response.ok || !data.success) {
      throw new Error("Failed to load bridge chains");
    }
    cachedChains = [...(data.result ?? [])].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? ""),
    );
    return cachedChains;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function useBridgeChains() {
  const [chains, setChains] = useState<BungeeChain[]>(cachedChains ?? []);
  const [isLoading, setIsLoading] = useState(!cachedChains);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!cachedChains) {
      setIsLoading(true);
      fetchChains()
        .then((c) => {
          if (alive) {
            setChains(c);
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
    }
    return () => {
      alive = false;
    };
  }, []);

  return { chains, isLoading, error };
}
