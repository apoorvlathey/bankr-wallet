/**
 * React subscription wrapper around the Bungee chains cache. Kept in its
 * own file so the underlying `bungeeChainCache.ts` stays React-free and
 * can be transitively imported into the service-worker background bundle
 * without dragging React in. See header of `bungeeChainCache.ts` for why.
 */

import { useEffect, useState } from "react";
import {
  getBungeeChainsLoadVersion,
  subscribeBungeeChains,
} from "@/lib/bungeeChainCache";

/** Re-renders consumers whenever the underlying cache reloads (initial
 *  async fetch, chrome.storage.onChanged events). Components that read
 *  `getBungeeChain` should call this so they pick up icons that arrive
 *  after their first render. */
export function useBungeeChainsVersion(): number {
  const [v, setV] = useState(getBungeeChainsLoadVersion());
  useEffect(() => {
    const unsubscribe = subscribeBungeeChains(() => {
      setV(getBungeeChainsLoadVersion());
    });
    // If a load fired between mount and effect, sync immediately.
    const current = getBungeeChainsLoadVersion();
    if (v !== current) setV(current);
    return unsubscribe;
    // We intentionally exclude `v` — the listener captures the current
    // setter and that's enough to deliver updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}
