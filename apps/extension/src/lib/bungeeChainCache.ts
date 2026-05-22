/**
 * Synchronous in-memory mirror of the cached Bungee `/supported-chains`
 * response. Lets the (sync) chain-icon resolver pick up Bungee logos for
 * chains we don't have a curated registry entry for (Abstract, Plume,
 * Sonic, Tempo, Plasma, …) so chain badges across the UI stop falling
 * back to "CH" initials.
 *
 * Data source: `chrome.storage.local["bungeeChains"]` — populated by
 * `getCachedBungeeChains()` in `chrome/bridgeApi.ts` (24h TTL). This
 * module fire-and-forget reads on import and listens for storage changes
 * so the in-memory copy stays in sync with whatever Bungee returned last.
 *
 * Deliberately React-free: this module is transitively imported by
 * `chainIcons.ts`, which is consumed by `portfolioTokens.ts` inside the
 * service-worker background bundle. Pulling React in here would inflate
 * the background bundle and blow up at boot (`process is not defined`
 * inside React's dev shim). The matching React hook lives in
 * `useBungeeChainsVersion.ts` and subscribes via `subscribeBungeeChains`.
 *
 * UX implication: on a cold popup boot the first paint may briefly show
 * the registry/fallback icon for Bungee-only chains. As soon as the
 * chrome.storage read resolves (typically <50ms), subscribed components
 * re-render with the real logo.
 */

import type { BungeeChain } from "@walletchan/shared/bungee";

const CHAINS_CACHE_KEY = "bungeeChains";

const chainsMap = new Map<number, BungeeChain>();
let loadVersion = 0;
const listeners = new Set<() => void>();

function applyChains(chains: BungeeChain[]) {
  chainsMap.clear();
  for (const c of chains) {
    if (typeof c.chainId === "number" && Number.isFinite(c.chainId)) {
      chainsMap.set(c.chainId, c);
    }
  }
  loadVersion++;
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* listener errors must not break siblings */
    }
  }
}

// Fire-and-forget initial load — no top-level await so import remains sync.
void (async () => {
  try {
    const stored = await chrome.storage.local.get(CHAINS_CACHE_KEY);
    const entry = stored[CHAINS_CACHE_KEY] as
      | { chains: BungeeChain[]; fetchedAt: number }
      | undefined;
    if (entry?.chains) applyChains(entry.chains);
  } catch {
    /* extension storage unavailable (e.g. tests) — cache stays empty */
  }
})();

// Keep the in-memory copy in sync with future writes (Bungee refetches,
// cross-tab updates).
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CHAINS_CACHE_KEY]) return;
    const next = changes[CHAINS_CACHE_KEY].newValue as
      | { chains: BungeeChain[] }
      | undefined;
    applyChains(next?.chains ?? []);
  });
} catch {
  /* non-extension context — listener API may not exist */
}

/** Synchronous lookup. Returns the Bungee chain entry for `chainId` if the
 *  cache has been loaded and the chain is supported. */
export function getBungeeChain(chainId: number): BungeeChain | undefined {
  return chainsMap.get(chainId);
}

/** Current load version — bumps every time the cache repopulates. Consumed
 *  by `useBungeeChainsVersion` (separate file) to trigger React re-renders. */
export function getBungeeChainsLoadVersion(): number {
  return loadVersion;
}

/** Subscribe to cache reloads. Returns an unsubscribe function. Framework-
 *  agnostic — the React hook is in `useBungeeChainsVersion.ts`. */
export function subscribeBungeeChains(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
