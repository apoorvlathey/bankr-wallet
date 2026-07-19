import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";
import { scrapePageMetadata } from "./pageState";
import type { BannerTabContext, BannerTheme } from "./types";

export const FALLBACK_BANNER_THEME: BannerTheme = {
  themeId: "bauhaus",
  isDark: false,
  bg: "#121212",
  fg: "#FFFFFF",
  fgMuted: "#A8A8A8",
  border: "#000000",
  shadow: "0 2px 0 0 #000000",
  accent: "#F0C020",
};

export async function getBannerTabContext(): Promise<BannerTabContext | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ens-get-tab-ctx",
    });
    return (response?.ctx as BannerTabContext) ?? null;
  } catch {
    return null;
  }
}

export async function getBannerTheme(): Promise<BannerTheme> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ens-get-theme-tokens",
    });
    if (response?.ok && response.theme) return response.theme as BannerTheme;
  } catch {
    // Use the static content-script fallback.
  }
  return FALLBACK_BANNER_THEME;
}

function sendCacheMetadata(context: BannerTabContext): void {
  const metadata = scrapePageMetadata();
  if (!metadata.title && !metadata.favicon) return;
  chrome.runtime
    .sendMessage({
      type: "ens-cache-metadata",
      name: context.ensName,
      title: metadata.title,
      favicon: buildBrowserFaviconUrl(location.href) || metadata.favicon,
    })
    .catch(() => undefined);
}

export function scheduleCacheMetadataCapture(
  context: BannerTabContext,
): void {
  const capture = () => sendCacheMetadata(context);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", capture, { once: true });
  } else {
    queueMicrotask(capture);
  }
  window.addEventListener("load", capture, { once: true });
  window.setTimeout(capture, 1500);
}

export function openGatewayWithBypass(url: string): void {
  chrome.runtime
    .sendMessage({ type: "ens-open-on-gateway", url })
    .then((response) => {
      if (!response?.ok) location.assign(url);
    })
    .catch(() => location.assign(url));
}
