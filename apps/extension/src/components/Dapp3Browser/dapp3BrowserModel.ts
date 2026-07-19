import type { EnsBookmark } from "@/chrome/ensBrowsing/bookmarks";
import type { CachedResolve } from "@/chrome/ensBrowsing/cache";
import type { BrowserConnectedDapp } from "@/chrome/ensBrowsing/connectedDapps";
import { googleFaviconUrl } from "@/constants/externalUrls";
import {
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

export type Dapp3NavigationTarget =
  | { kind: "ens"; host: string; rest: string }
  | { kind: "address"; address: string; rest: string }
  | { kind: "https"; url: string };

function normalizeRest(rest: string): string {
  if (!rest) return "";
  if (rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#")) {
    return rest;
  }
  return `/${rest}`;
}

function directHttpsTarget(rawInput: string): Dapp3NavigationTarget | null {
  const trimmed = rawInput.trim();
  if (trimmed.length > 2_048 || !/^https:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return null;
    }
    return { kind: "https", url: url.href };
  } catch {
    return null;
  }
}

export function parseDapp3Target(rawInput: string): Dapp3NavigationTarget | null {
  const trimmed = rawInput
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+/, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^([^/?#]+)(.*)$/);
  if (!match?.[1]) return null;

  const head = match[1].toLowerCase().replace(/:\d+$/, "");
  const rest = normalizeRest(match[2] || "");

  if (/^0x[a-f0-9]{40}$/.test(head)) {
    return { kind: "address", address: head, rest };
  }
  const w3link = head.match(/^(0x[a-f0-9]{40})\.1\.w3link\.io$/);
  if (w3link?.[1]) return { kind: "address", address: w3link[1], rest };

  const w3eth = head.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.w3eth\.io$/);
  if (w3eth?.[1]) {
    const label = w3eth[1];
    return /^0x[a-f0-9]{40}$/.test(label)
      ? { kind: "address", address: label, rest }
      : { kind: "ens", host: `${label}.eth`, rest };
  }

  const ethGateway = head.match(/^((?:[a-z0-9-]+\.)+eth)\.(?:limo|link)$/);
  if (ethGateway?.[1]) return { kind: "ens", host: ethGateway[1], rest };
  const gweiGateway = head.match(/^((?:[a-z0-9-]+\.)+gwei)\.domains$/);
  if (gweiGateway?.[1]) return { kind: "ens", host: gweiGateway[1], rest };
  if (/^(?:[a-z0-9-]+\.)+(?:eth|gwei)\.?$/.test(head)) {
    return {
      kind: "ens",
      host: head.endsWith(".") ? head.slice(0, -1) : head,
      rest,
    };
  }
  return directHttpsTarget(rawInput);
}

export function navigationUrlForTarget(target: Dapp3NavigationTarget): string {
  if (target.kind === "https") return target.url;
  const path = target.rest || "/";
  return target.kind === "ens"
    ? `http://${target.host}${path}`
    : `https://${target.address}.w3eth.io${path}`;
}

export function filterConnectedDapps(
  dapps: BrowserConnectedDapp[],
  query: string,
  displayLabel?: (dapp: BrowserConnectedDapp) => string,
): BrowserConnectedDapp[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return dapps;
  return dapps.filter((dapp) =>
    [dapp.hostname, dapp.title, dapp.origin, displayLabel?.(dapp)].some((value) =>
      value?.toLowerCase().includes(needle),
    ),
  );
}

export function connectedFavoriteOrigins(
  bookmarks: EnsBookmark[],
): ReadonlySet<string> {
  return new Set(
    bookmarks
      .map((bookmark) => bookmark.launchUrl)
      .filter((url): url is string => typeof url === "string"),
  );
}

function bookmarkGatewayOrigin(bookmark: EnsBookmark): string | null {
  if (bookmark.launchUrl) return null;
  if (bookmark.kind === "web3" || /^0x[a-f0-9]{40}$/.test(bookmark.ensName)) {
    const label = bookmark.ensName.endsWith(".eth")
      ? bookmark.ensName.slice(0, -4)
      : bookmark.ensName;
    return `https://${label}.w3eth.io`;
  }
  if (bookmark.ensName.endsWith(".gwei")) {
    return `https://${bookmark.ensName}.domains`;
  }
  if (bookmark.ensName.endsWith(".eth")) {
    return `https://${bookmark.ensName}.limo`;
  }
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

export function favoriteDappDisplayUrl(bookmark: EnsBookmark): string {
  if (bookmark.launchUrl) {
    try {
      return new URL(bookmark.launchUrl).hostname;
    } catch {
      // Persisted records are normalized on write; fall through defensively.
    }
  }
  return bookmark.path === "/"
    ? bookmark.ensName
    : `${bookmark.ensName}${bookmark.path}`;
}

export function favoriteDappFaviconUrl(bookmark: EnsBookmark): string {
  const favicon = bookmark.favicon?.trim();
  if (
    favicon &&
    (isAllowedRemoteImageUrl(favicon) || sanitizeTrustedRendererImageSrc(favicon))
  ) {
    return favicon;
  }

  if (bookmark.launchUrl) {
    return googleFaviconUrl(favoriteDappDisplayUrl(bookmark), 64);
  }

  const gatewayOrigin = bookmarkGatewayOrigin(bookmark);
  if (!gatewayOrigin) return googleFaviconUrl(bookmark.ensName, 64);
  return `${gatewayOrigin}${favicon ? gatewayAssetPath(favicon) : "/favicon.ico"}`;
}

export function favoriteDappFaviconFallbackUrl(
  bookmark: EnsBookmark,
): string {
  const hostname = bookmark.launchUrl
    ? favoriteDappDisplayUrl(bookmark)
    : (() => {
        const gatewayOrigin = bookmarkGatewayOrigin(bookmark);
        return gatewayOrigin
          ? new URL(gatewayOrigin).hostname
          : bookmark.ensName;
      })();
  return googleFaviconUrl(hostname, 64);
}

export function favoriteDappBrowserFaviconPageUrl(
  bookmark: EnsBookmark,
): string | null {
  if (bookmark.launchUrl) return bookmark.launchUrl;
  if (bookmark.kind === "web3" || /^0x[a-f0-9]{40}$/.test(bookmark.ensName)) {
    const label = bookmark.ensName.endsWith(".eth")
      ? bookmark.ensName.slice(0, -4)
      : bookmark.ensName;
    return `https://${label}.w3eth.io/`;
  }
  if (bookmark.ensName.endsWith(".gwei")) {
    return `https://${bookmark.ensName}.domains/`;
  }
  if (bookmark.ensName.endsWith(".eth")) {
    return `https://${bookmark.ensName}.link/`;
  }
  return null;
}

export function bookmarkForConnectedDapp(
  dapp: BrowserConnectedDapp,
  addedAt = Date.now(),
): EnsBookmark {
  return {
    ensName: dapp.hostname,
    path: "/",
    launchUrl: dapp.origin,
    title: dapp.title,
    favicon: dapp.favicon,
    addedAt,
  };
}

export function bookmarkForCachedDapp(
  site: CachedResolve,
  addedAt = Date.now(),
): EnsBookmark {
  return {
    ensName: site.ensName,
    path: "/",
    kind: site.kind,
    contractAddress: site.contractAddress,
    title: site.title,
    favicon: site.favicon,
    addedAt,
  };
}

export function bookmarkForDirectoryDapp(
  suggestion: {
    url: string;
    name: string;
    logo?: string;
  },
  addedAt = Date.now(),
): EnsBookmark | null {
  let url: URL;
  try {
    url = new URL(suggestion.url);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname
  ) {
    return null;
  }
  return {
    ensName: url.hostname.toLowerCase(),
    path: "/",
    launchUrl: url.origin,
    title: suggestion.name.trim() || url.hostname,
    ...(suggestion.logo ? { favicon: suggestion.logo } : {}),
    addedAt,
  };
}
