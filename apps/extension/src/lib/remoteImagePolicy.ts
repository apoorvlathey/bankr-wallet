import { classifyPrivateNetworkHostname } from "./privateNetworkPolicy";

const MAX_REMOTE_IMAGE_URL_CHARS = 2_048;
// The background encoder caps cached images at 512 KiB before base64
// expansion. Keep renderer data URLs bounded to the corresponding encoded
// ceiling (+ a small header allowance) so storage corruption cannot turn an
// <img> into an unbounded allocation.
const MAX_RENDERER_RASTER_DATA_URL_CHARS = 700_000;

const ALLOWED_RASTER_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);

/**
 * Remote image bytes are decoded and re-encoded before reaching the UI. Keep
 * that decoder boundary raster-only: SVG is an active document format with a
 * richer external-resource model even when the final canvas output is inert.
 */
export function isAllowedRasterImageContentType(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return !!mediaType && ALLOWED_RASTER_IMAGE_CONTENT_TYPES.has(mediaType);
}

export function isAllowedRemoteImageUrl(value: string): boolean {
  if (!value || value.length > MAX_REMOTE_IMAGE_URL_CHARS) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return !(
      !hostname ||
      /\.(?:test|invalid|onion)$/.test(
        hostname,
      ) ||
      classifyPrivateNetworkHostname(hostname) !== null
    );
  } catch {
    return false;
  }
}

/** Allow bounded raster data URLs, but never attacker-controlled SVG markup. */
export function sanitizeUntrustedImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (isAllowedRemoteImageUrl(value)) return value;
  if (
    value.length <= MAX_REMOTE_IMAGE_URL_CHARS &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i.test(value)
  ) {
    return value;
  }
  return null;
}

function isPackagedExtensionPath(value: string): boolean {
  if (
    !value ||
    value.length > MAX_REMOTE_IMAGE_URL_CHARS ||
    /[\u0000-\u0020\u007f\\<>"']/.test(value) ||
    value.startsWith("//")
  ) {
    return false;
  }

  const hasImageExtension = (pathname: string) =>
    /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(pathname);

  // Bare and root-relative paths resolve inside the current extension origin.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const candidate = new URL(value, "https://extension.invalid/");
      return (
        candidate.origin === "https://extension.invalid" &&
        hasImageExtension(candidate.pathname)
      );
    } catch {
      return false;
    }
  }

  // chrome.runtime.getURL() is used by a few packaged assets. Require the
  // current extension origin rather than trusting an arbitrary extension ID.
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return false;
  try {
    const extensionRoot = new URL(chrome.runtime.getURL("/"));
    const candidate = new URL(value);
    return (
      candidate.protocol === extensionRoot.protocol &&
      candidate.host === extensionRoot.host &&
      hasImageExtension(candidate.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Sources that may be assigned directly to an <img> in a trusted extension
 * renderer. Public HTTPS URLs intentionally do not pass this predicate: they
 * must first cross the background fetch/decode/re-encode boundary.
 */
export function sanitizeTrustedRendererImageSrc(
  value: unknown,
): string | null {
  if (typeof value !== "string" || !value) return null;
  if (isPackagedExtensionPath(value)) return value;
  if (
    value.length <= MAX_RENDERER_RASTER_DATA_URL_CHARS &&
    /^data:image\/(?:avif|bmp|gif|jpeg|png|vnd\.microsoft\.icon|webp|x-icon);base64,[a-z0-9+/]+=*$/i.test(
      value,
    )
  ) {
    return value;
  }
  return null;
}
