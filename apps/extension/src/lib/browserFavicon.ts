const MAX_FAVICON_PAGE_URL_CHARS = 2_048;

function isHostedGatewayHostname(hostname: string): boolean {
  return (
    /.+\.eth\.(?:limo|link)$/i.test(hostname) ||
    /.+\.gwei\.domains$/i.test(hostname) ||
    /.+\.w3eth\.io$/i.test(hostname)
  );
}

function isLocalSubdomainGatewayUrl(pageUrl: URL): boolean {
  if (pageUrl.protocol !== "http:") return false;
  if (!/^.+\.(?:ipfs|ipns)\.[a-z0-9.-]+$/i.test(pageUrl.hostname)) {
    return false;
  }
  if (pageUrl.hostname.includes("..")) return false;
  if (!pageUrl.port) return true;
  const port = Number(pageUrl.port);
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

export function isAllowedBrowserFaviconPageUrl(rawPageUrl: string): boolean {
  if (!rawPageUrl || rawPageUrl.length > MAX_FAVICON_PAGE_URL_CHARS) {
    return false;
  }
  try {
    const pageUrl = new URL(rawPageUrl);
    if (pageUrl.username || pageUrl.password) return false;
    if (isLocalSubdomainGatewayUrl(pageUrl)) {
      return true;
    }
    return (
      pageUrl.protocol === "https:" &&
      !pageUrl.port &&
      isHostedGatewayHostname(pageUrl.hostname)
    );
  } catch {
    return false;
  }
}

export function buildBrowserFaviconUrl(
  rawPageUrl: string,
  extensionRoot = chrome.runtime.getURL("/"),
): string | undefined {
  if (!isAllowedBrowserFaviconPageUrl(rawPageUrl)) return undefined;
  const pageUrl = new URL(rawPageUrl);
  const faviconUrl = new URL("_favicon/", extensionRoot);
  faviconUrl.searchParams.set("pageUrl", pageUrl.href);
  faviconUrl.searchParams.set("size", "64");
  return faviconUrl.href;
}
