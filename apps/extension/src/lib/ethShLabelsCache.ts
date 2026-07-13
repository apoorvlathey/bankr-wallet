/**
 * Shared cache + dedup for eth.sh address labels (e.g. "Permit2",
 * "Uniswap V3 Router", "AugustusV6").
 *
 * Six surfaces query the same labels endpoint — single-tx confirmation,
 * approve display, typed-data display, clear-signing AddressInline, generic
 * AddressParam, and the inline batch summary. A 5-call batch to the same
 * spender used to fire ~6 redundant fetches per address per popup open;
 * this collapses them to one network roundtrip ever (then storage-backed
 * forever).
 *
 * Three layers:
 *   - In-memory map → instant for repeat lookups inside the same popup.
 *   - In-flight promise dedup → concurrent calls share one fetch.
 *   - chrome.storage.local cache → survives popup close + service-worker
 *     restart. 7-day TTL; eth.sh adds labels slowly and an extra week of
 *     freshness is fine compared to the popup latency we're saving.
 *
 * Returns `string[]` (the full list). Callers that just want the headline
 * label use `result[0]`; AddressParam renders the whole array. Empty array
 * means "known no labels" — we still cache that to avoid re-fetching.
 */

import { ethShLabelsUrl } from "@/constants/externalUrls";
import { fetchJsonBounded } from "@/chrome/boundedHttpResponse";

const STORAGE_PREFIX = "ethShLabels:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedLabels {
  labels: string[];
  fetchedAt: number;
}

function key(chainId: number, address: string): string {
  return `${STORAGE_PREFIX}${chainId}:${address.toLowerCase()}`;
}

// In-memory hot cache and in-flight dedup. Both keyed by the same storage
// key so a single popup mount serves all sibling components from the same
// promise even before storage has been touched.
const memCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

export async function getEthShLabels(
  address: string,
  chainId: number,
): Promise<string[]> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return [];
  const k = key(chainId, address);

  const mem = memCache.get(k);
  if (mem) return mem;

  const existing = inflight.get(k);
  if (existing) return existing;

  const promise = (async () => {
    // chrome.storage hit — survives popup close.
    try {
      const stored = await chrome.storage.local.get(k);
      const cached = stored[k] as CachedLabels | undefined;
      if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        memCache.set(k, cached.labels);
        return cached.labels;
      }
    } catch {
      // storage unavailable — continue to network fetch
    }

    let labels: string[] = [];
    try {
      const { response, data } = await fetchJsonBounded(
        ethShLabelsUrl(address, chainId),
        { method: "GET" },
        { timeoutMs: 8_000, maxBytes: 256 * 1024 },
      );
      if (response.ok) {
        if (Array.isArray(data)) {
          labels = data.filter((s): s is string => typeof s === "string");
        }
      }
    } catch {
      // Network error — leave labels empty. We still cache the miss so a
      // popup-open burst doesn't re-hit the API for every sibling component.
    }

    memCache.set(k, labels);
    try {
      await chrome.storage.local.set({
        [k]: { labels, fetchedAt: Date.now() } satisfies CachedLabels,
      });
    } catch {
      // ignore quota / extension-context errors
    }
    return labels;
  })().finally(() => {
    inflight.delete(k);
  });

  inflight.set(k, promise);
  return promise;
}
