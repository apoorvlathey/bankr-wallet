import { classifyPrivateNetworkHostname } from "./privateNetworkPolicy";

const MAX_EXTERNAL_URL_CHARS = 2_048;
const BLOCKED_PUBLIC_HOST_SUFFIXES = [".invalid", ".test", ".onion"];

export type ExternalNavigationOptions = {
  /** Explicit Settings-only escape hatch for local explorer development. */
  allowLoopback?: boolean;
};

/**
 * Sanitize a URL before assigning it to an extension-page anchor/window/tab.
 * Remote metadata gets public HTTPS only. Settings-owned custom explorers may
 * explicitly retain loopback HTTP(S), but never credentials or other private
 * network targets.
 */
export function sanitizeExternalNavigationUrl(
  value: unknown,
  options: ExternalNavigationOptions = {},
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EXTERNAL_URL_CHARS
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;

  const networkClass = classifyPrivateNetworkHostname(url.hostname);
  if (networkClass === "loopback" && options.allowLoopback === true) {
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  }
  if (networkClass) return null;
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    BLOCKED_PUBLIC_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    )
  ) {
    return null;
  }
  return url.toString();
}

export function sanitizeCustomExplorerUrl(value: unknown): string | null {
  return sanitizeExternalNavigationUrl(value, { allowLoopback: true });
}
