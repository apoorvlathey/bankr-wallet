import { useState, useEffect, useCallback, useRef } from "react";
import {
  getEnsIdentityCache,
  isCacheValid,
  resolveAndCacheIdentity,
  type EnsIdentityCacheEntry,
} from "@/lib/ensIdentityCache";

interface EnsIdentity {
  name: string | null;
  avatar: string | null;
}

interface UseEnsIdentitiesReturn {
  identities: Map<string, EnsIdentity>;
  isLoading: boolean;
  refreshAddress: (address: string) => Promise<void>;
}

export function useEnsIdentities(addresses: string[]): UseEnsIdentitiesReturn {
  const [identities, setIdentities] = useState<Map<string, EnsIdentity>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const resolvedRef = useRef<Set<string>>(new Set());

  // Stable serialized key for addresses array
  const addressesKey = addresses
    .map((a) => a.toLowerCase())
    .sort()
    .join(",");

  // Listen for storage changes so refreshes from other UI surfaces
  // (e.g. AccountSettings' "Refresh ENS Data") propagate immediately.
  useEffect(() => {
    const lowerAddresses = addresses.map((a) => a.toLowerCase());
    if (lowerAddresses.length === 0) return;

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local" || !changes.ensIdentityCache) return;
      const newCache = changes.ensIdentityCache.newValue as
        | Record<string, EnsIdentityCacheEntry>
        | undefined;
      if (!newCache) return;

      setIdentities((prev) => {
        const updated = new Map(prev);
        let mutated = false;
        for (const lower of lowerAddresses) {
          const entry = newCache[lower];
          if (!entry) continue;
          const existing = prev.get(lower);
          if (
            !existing ||
            existing.name !== entry.name ||
            existing.avatar !== entry.avatar
          ) {
            updated.set(lower, { name: entry.name, avatar: entry.avatar });
            mutated = true;
          }
        }
        return mutated ? updated : prev;
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [addressesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    async function loadAndResolve() {
      if (addresses.length === 0) return;

      const cache = await getEnsIdentityCache();
      const newIdentities = new Map<string, EnsIdentity>();
      const staleAddresses: string[] = [];

      for (const addr of addresses) {
        const lower = addr.toLowerCase();
        const cached = cache[lower];

        if (cached && isCacheValid(cached)) {
          newIdentities.set(lower, { name: cached.name, avatar: cached.avatar });
        } else {
          // Return whatever we have in cache (even if stale) while we re-resolve
          if (cached) {
            newIdentities.set(lower, { name: cached.name, avatar: cached.avatar });
          }
          // Only resolve if we haven't already started resolving in this session
          if (!resolvedRef.current.has(lower)) {
            staleAddresses.push(addr);
          }
        }
      }

      if (!cancelled) {
        setIdentities(newIdentities);
      }

      if (staleAddresses.length > 0) {
        if (!cancelled) setIsLoading(true);

        // Mark as being resolved
        for (const addr of staleAddresses) {
          resolvedRef.current.add(addr.toLowerCase());
        }

        const results = await Promise.allSettled(
          staleAddresses.map((addr) => resolveAndCacheIdentity(addr))
        );

        if (!cancelled) {
          setIdentities((prev) => {
            const updated = new Map(prev);
            staleAddresses.forEach((addr, i) => {
              const result = results[i];
              const lower = addr.toLowerCase();
              if (result.status === "fulfilled") {
                updated.set(lower, result.value);
              }
            });
            return updated;
          });
          setIsLoading(false);
        }
      }
    }

    loadAndResolve();

    return () => {
      cancelled = true;
    };
  }, [addressesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAddress = useCallback(async (address: string) => {
    const lower = address.toLowerCase();
    setIsLoading(true);
    try {
      const result = await resolveAndCacheIdentity(address);
      setIdentities((prev) => {
        const updated = new Map(prev);
        updated.set(lower, result);
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { identities, isLoading, refreshAddress };
}
