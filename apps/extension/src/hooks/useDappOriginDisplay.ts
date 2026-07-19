import { useCallback, useSyncExternalStore } from "react";
import {
  ENS_RESOLVE_CACHE_KEY,
  listCachedForDisplay,
  type CachedResolve,
} from "@/chrome/ensBrowsing/cache";
import {
  DEFAULT_ENS_BROWSING_SETTINGS,
  ENS_BROWSING_SETTINGS_KEY,
  getEnsBrowsingSettings,
} from "@/chrome/ensBrowsing/settingsStorage";
import {
  getDappOriginDisplay,
  type DappOriginDisplay,
} from "@/lib/dappOriginDisplay";
import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";

type DisplayState = {
  cachedSites: CachedResolve[];
  gatewayHost: string;
  gatewayPort: number;
};

let snapshot: DisplayState = {
  cachedSites: [],
  gatewayHost: DEFAULT_ENS_BROWSING_SETTINGS.gatewayHost,
  gatewayPort: DEFAULT_ENS_BROWSING_SETTINGS.gatewayPort,
};
let refreshVersion = 0;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const subscriber of subscribers) subscriber();
}

async function refreshDisplayState(): Promise<void> {
  const version = ++refreshVersion;
  const [cachedSites, settings] = await Promise.all([
    listCachedForDisplay().catch(() => []),
    getEnsBrowsingSettings().catch(() => DEFAULT_ENS_BROWSING_SETTINGS),
  ]);
  if (version !== refreshVersion) return;
  snapshot = {
    cachedSites,
    gatewayHost: settings.gatewayHost,
    gatewayPort: settings.gatewayPort,
  };
  emit();
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void {
  if (areaName !== "local") return;
  if (
    ENS_RESOLVE_CACHE_KEY in changes ||
    ENS_BROWSING_SETTINGS_KEY in changes
  ) {
    void refreshDisplayState();
  }
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  if (subscribers.size === 1) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    void refreshDisplayState();
  }
  return () => {
    subscribers.delete(onStoreChange);
    if (subscribers.size === 0) {
      refreshVersion += 1;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  };
}

function getSnapshot(): DisplayState {
  return snapshot;
}

export function useDappOriginFormatter(): (
  rawOrigin: string,
) => DappOriginDisplay {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useCallback(
    (rawOrigin: string) => {
      const display = getDappOriginDisplay(rawOrigin, state.cachedSites, {
        host: state.gatewayHost,
        port: state.gatewayPort,
      });
      const browserFaviconSrc = display.browserFaviconPageUrl
        ? buildBrowserFaviconUrl(display.browserFaviconPageUrl)
        : undefined;
      return {
        ...display,
        faviconFallbackSrc:
          browserFaviconSrc || display.faviconFallbackSrc,
      };
    },
    [state],
  );
}
