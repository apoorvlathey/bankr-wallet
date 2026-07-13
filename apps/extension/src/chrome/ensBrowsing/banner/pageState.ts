export interface PageMetadata {
  title?: string;
  favicon?: string;
}

export function currentPagePath(pageLocation: Location = location): string {
  const path =
    pageLocation.pathname + pageLocation.search + pageLocation.hash;
  return path === "/" ? "" : path;
}

export function safeFaviconUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
  return undefined;
}

export function scrapePageMetadata(
  pageDocument: Document = document,
  pageLocation: Location = location,
): PageMetadata {
  const title = pageDocument.title?.trim() || undefined;
  const selectors = [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  let favicon: string | undefined;
  for (const selector of selectors) {
    const element = pageDocument.querySelector(selector) as HTMLLinkElement | null;
    const href = element?.getAttribute("href");
    if (!href) continue;
    try {
      favicon = safeFaviconUrl(new URL(href, pageLocation.href).toString());
      if (favicon) break;
    } catch {
      // Ignore malformed, page-controlled favicon URLs.
    }
  }
  return { title, favicon };
}

/** Convert the banner's restricted address input into a navigation target. */
export function parseEnsAddressInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/^https?:\/\//i, "");
  if (!trimmed) return null;
  const match = trimmed.match(/^([^/?#]+)(.*)$/);
  if (!match?.[1]) return null;
  const host = match[1].toLowerCase();
  const rest = match[2] || "/";
  const path =
    rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#")
      ? rest
      : `/${rest}`;
  if (/^0x[a-f0-9]{40}$/.test(host)) {
    return `https://${host}.w3eth.io${path}`;
  }
  if (!/^(?:[a-z0-9-]+\.)+(?:eth|gwei)$/.test(host)) return null;
  return `http://${host}${path}`;
}

export function splitEnsDisplayUrl(text: string): {
  host: string;
  path: string;
} {
  const match = text.match(/^(.+?\.(?:eth|gwei))(.*)$/i);
  if (!match) return { host: text, path: "" };
  return { host: match[1]!, path: match[2]! };
}
