import type { CachedResolve } from "@/chrome/ensBrowsing/cache";
import {
  encodeIpnsLabel,
  parseGatewayHost,
  type GatewayLocation,
} from "@/chrome/ensBrowsing/gateway";
import { googleFaviconUrl } from "@/constants/externalUrls";
import {
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

export type DappOriginDisplay = {
  label: string;
  hostname: string | null;
  resolvedName: string | null;
  contenthashEnsName: string | null;
  isLocalGateway: boolean;
  isEnsIpfsGateway: boolean;
  faviconSrc: string | null;
  faviconFallbackSrc: string | null;
  browserFaviconPageUrl: string | null;
};

function hostedEnsGatewayName(hostname: string): string | null {
  const match = hostname.match(/^((?:[a-z0-9-]+\.)+eth)\.(?:limo|link)$/);
  return match?.[1] ?? null;
}

function matchesGatewayPort(url: URL, gatewayPort: number): boolean {
  const effectivePort = url.port || (url.protocol === "http:" ? "80" : "443");
  return effectivePort === String(gatewayPort);
}

function cachedSiteForGatewayLabel(
  kind: "ipfs" | "ipns",
  label: string,
  cachedSites: readonly CachedResolve[],
): CachedResolve | null {
  const normalizedLabel = label.toLowerCase();
  const match = cachedSites.find((site) => {
    if (kind === "ipns") {
      return (
        site.kind === "ipns" &&
        encodeIpnsLabel(site.value).toLowerCase() === normalizedLabel
      );
    }
    return (
      (site.kind === "ipfs" || site.kind === "web3") &&
      site.value.toLowerCase() === normalizedLabel
    );
  });
  return match ?? null;
}

function hostedGatewayOrigin(site: CachedResolve): string | null {
  const name = site.ensName.toLowerCase();
  if (site.kind === "web3" || /^0x[a-f0-9]{40}$/.test(name)) {
    const label = name.endsWith(".eth") ? name.slice(0, -4) : name;
    return `https://${label}.w3eth.io`;
  }
  if (name.endsWith(".gwei")) return `https://${name}.domains`;
  if (name.endsWith(".eth")) return `https://${name}.limo`;
  return null;
}

function gatewayAssetPath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const gatewayPath = url.pathname.match(/^\/(?:ipfs|ipns)\/[^/]+(\/.*)?$/i);
    return `${gatewayPath?.[1] || url.pathname || "/favicon.ico"}${url.search}`;
  } catch {
    return "/favicon.ico";
  }
}

function faviconSources(
  rawOrigin: string,
  site: CachedResolve,
): Pick<
  DappOriginDisplay,
  "faviconSrc" | "faviconFallbackSrc" | "browserFaviconPageUrl"
> {
  const hostedOrigin = hostedGatewayOrigin(site);
  const cachedFavicon = site.favicon?.trim();
  const trustedCachedFavicon = cachedFavicon
    ? sanitizeTrustedRendererImageSrc(cachedFavicon)
    : null;
  const remoteCachedFavicon = cachedFavicon && isAllowedRemoteImageUrl(cachedFavicon)
    ? cachedFavicon
    : null;
  const projectedFavicon =
    hostedOrigin && cachedFavicon && /^https?:\/\//i.test(cachedFavicon)
      ? `${hostedOrigin}${gatewayAssetPath(cachedFavicon)}`
      : null;
  const fallbackHostname = hostedOrigin
    ? new URL(hostedOrigin).hostname
    : site.ensName;
  return {
    faviconSrc:
      trustedCachedFavicon ||
      remoteCachedFavicon ||
      projectedFavicon ||
      (hostedOrigin ? `${hostedOrigin}/favicon.ico` : null),
    faviconFallbackSrc: googleFaviconUrl(fallbackHostname, 64),
    browserFaviconPageUrl: rawOrigin,
  };
}

/**
 * Returns a friendly display identity without changing the security origin.
 * ENS rewriting is disabled with WalletChan Browser; otherwise only exact
 * hosted gateways or the configured subdomain gateway host and port are mapped.
 */
export function getDappOriginDisplay(
  rawOrigin: string,
  cachedSites: readonly CachedResolve[],
  gateway: GatewayLocation,
  ensBrowsingEnabled = true,
): DappOriginDisplay {
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    return {
      label: rawOrigin,
      hostname: null,
      resolvedName: null,
      contenthashEnsName: null,
      isLocalGateway: false,
      isEnsIpfsGateway: false,
      faviconSrc: null,
      faviconFallbackSrc: null,
      browserFaviconPageUrl: null,
    };
  }

  const hostname = url.hostname.toLowerCase();
  const hostedEnsName = hostedEnsGatewayName(hostname);
  if (!ensBrowsingEnabled) {
    return {
      label: hostname || rawOrigin,
      hostname: hostname || null,
      resolvedName: null,
      contenthashEnsName: hostedEnsName,
      isLocalGateway: false,
      isEnsIpfsGateway: hostedEnsName !== null,
      faviconSrc: null,
      faviconFallbackSrc: googleFaviconUrl(hostname, 64),
      browserFaviconPageUrl: rawOrigin,
    };
  }
  if (hostedEnsName) {
    return {
      label: hostedEnsName,
      hostname: hostedEnsName,
      resolvedName: hostedEnsName,
      contenthashEnsName: hostedEnsName,
      isLocalGateway: false,
      isEnsIpfsGateway: true,
      faviconSrc: null,
      faviconFallbackSrc: googleFaviconUrl(hostname, 64),
      browserFaviconPageUrl: rawOrigin,
    };
  }
  if (url.protocol !== "http:") {
    return {
      label: hostname || rawOrigin,
      hostname: hostname || null,
      resolvedName: null,
      contenthashEnsName: null,
      isLocalGateway: false,
      isEnsIpfsGateway: false,
      faviconSrc: null,
      faviconFallbackSrc: null,
      browserFaviconPageUrl: null,
    };
  }
  const parsedGateway = parseGatewayHost(hostname, gateway.host);
  if (!parsedGateway || !matchesGatewayPort(url, gateway.port)) {
    return {
      label: hostname || rawOrigin,
      hostname: hostname || null,
      resolvedName: null,
      contenthashEnsName: null,
      isLocalGateway: false,
      isEnsIpfsGateway: false,
      faviconSrc: null,
      faviconFallbackSrc: null,
      browserFaviconPageUrl: null,
    };
  }

  const cachedSite = cachedSiteForGatewayLabel(
    parsedGateway.kind,
    parsedGateway.label,
    cachedSites,
  );
  const resolvedName = cachedSite?.ensName ?? null;
  const isEnsIpfsGateway = Boolean(
    resolvedName?.endsWith(".eth") &&
      (cachedSite?.kind === "ipfs" || cachedSite?.kind === "ipns"),
  );
  return {
    label: resolvedName || hostname || rawOrigin,
    hostname: resolvedName || hostname || null,
    resolvedName,
    contenthashEnsName: isEnsIpfsGateway ? resolvedName : null,
    isLocalGateway: true,
    isEnsIpfsGateway,
    ...(cachedSite
      ? faviconSources(rawOrigin, cachedSite)
      : {
          faviconSrc: null,
          faviconFallbackSrc: null,
          browserFaviconPageUrl: null,
        }),
  };
}
