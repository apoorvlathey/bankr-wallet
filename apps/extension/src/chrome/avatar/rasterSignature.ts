/**
 * Recognize a deliberately small set of inert raster signatures. The caller
 * still sends the resulting Blob through createImageBitmap and WebP re-encode;
 * this only recovers a trustworthy MIME for misconfigured binary CDNs.
 */
export function sniffAvatarRasterContentType(bytes: Uint8Array): string | null {
  const ascii = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    (ascii(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) ||
      ascii(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    ascii(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
