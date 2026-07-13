import {
  isAllowedRasterImageContentType,
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

/** Reject attacker-controlled LAN, loopback, credentialed, and non-HTTPS URLs. */
export function isAllowedAvatarUrl(value: string): boolean {
  return isAllowedRemoteImageUrl(value);
}

/** Normalize only an explicitly supported raster response media type. */
export function normalizeAvatarRasterContentType(
  value: string | null,
): string | null {
  if (!isAllowedRasterImageContentType(value)) return null;
  return value!.split(";", 1)[0]!.trim().toLowerCase();
}

/** Persisted entries must still satisfy the current trusted-renderer policy. */
export function isAllowedCachedAvatarDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/") &&
    sanitizeTrustedRendererImageSrc(value) === value
  );
}
