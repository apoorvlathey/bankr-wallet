function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function redirectW3linkToInterstitial(): void {
  if (!isTopFrame()) return;
  const host = location.hostname.toLowerCase().replace(/\.$/, "");
  if (!/^(0x[a-f0-9]{40})\.1\.w3link\.io$/.test(host)) return;
  location.replace(
    `${chrome.runtime.getURL("interstitial.html")}#${location.href}`,
  );
}

function parseEnsGatewayName(hostname: string): string | null {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  const ethGateway = lower.match(/^((?:[a-z0-9-]+\.)+eth)\.(?:limo|link)$/);
  if (ethGateway?.[1]) return ethGateway[1];
  const w3eth = lower.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.w3eth\.io$/);
  if (!w3eth?.[1] || /^0x[a-f0-9]{40}$/.test(w3eth[1])) return null;
  return `${w3eth[1]}.eth`;
}

function safeFaviconUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url)
    ? url
    : undefined;
}

function scrapeEnsGatewayMetadata(): { title?: string; favicon?: string } {
  const title = document.title?.trim() || undefined;
  const selectors = [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  let favicon: string | undefined;
  for (const selector of selectors) {
    const href = (
      document.querySelector(selector) as HTMLLinkElement | null
    )?.getAttribute("href");
    if (!href) continue;
    try {
      favicon = safeFaviconUrl(new URL(href, location.href).toString());
      if (favicon) break;
    } catch {
      // Ignore malformed favicon hrefs.
    }
  }
  return { title, favicon };
}

function sendEnsGatewayMetadata(ensName: string): void {
  const metadata = scrapeEnsGatewayMetadata();
  if (!metadata.title && !metadata.favicon) return;
  chrome.runtime
    .sendMessage({
      type: "ens-cache-metadata",
      name: ensName,
      title: metadata.title,
      favicon: metadata.favicon,
    })
    .catch(() => undefined);
}

export function startGatewayMetadataCapture(): void {
  redirectW3linkToInterstitial();
  const ensName = parseEnsGatewayName(location.hostname);
  if (!ensName) return;
  const capture = () => sendEnsGatewayMetadata(ensName);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", capture, { once: true });
  } else {
    queueMicrotask(capture);
  }
  window.addEventListener("load", capture, { once: true });
  window.setTimeout(capture, 1500);
}
