import type { CachedResolve } from "@/chrome/ensBrowsing/cache";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";

export const DAPP3_EXAMPLES = [
  { label: "vitalik.eth", value: "vitalik.eth" },
  { label: "apoorv.gwei", value: "apoorv.gwei" },
  { label: "zrouter.eth", value: "zrouter.eth" },
  { label: "OFTScan (0x…9e32)", value: "0x000000f7f90708c034c854efd1d5bfe8e9079e32" },
];

export function buildInterstitialUrl(targetUrl: string): string {
  return `${chrome.runtime.getURL("interstitial.html")}#${targetUrl}`;
}

export function formatCachedDappKind(kind: CachedResolve["kind"]): string {
  return kind === "web3" ? "HTML" : kind.toUpperCase();
}

export function cachedFaviconUrl(site: CachedResolve): string {
  if (site.kind === "web3" || /^0x[a-f0-9]{40}$/.test(site.ensName)) {
    const label = site.ensName.endsWith(".eth") ? site.ensName.slice(0, -4) : site.ensName;
    return `https://${label}.w3eth.io/favicon.ico`;
  }
  if (site.ensName.endsWith(".gwei")) return `https://${site.ensName}.domains/favicon.ico`;
  return `https://${site.ensName}.limo/favicon.ico`;
}

export function cachedFaviconFallbackUrl(site: CachedResolve): string {
  const gatewayUrl = cachedFaviconUrl(site).replace(/\/favicon\.ico$/, "/");
  return buildBrowserFaviconUrl(gatewayUrl) ||
    googleFaviconUrl(new URL(gatewayUrl).hostname, 64);
}
