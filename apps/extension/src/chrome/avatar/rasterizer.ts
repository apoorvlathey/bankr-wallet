import {
  AVATAR_MAX_DOWNLOAD_BYTES,
  AVATAR_MAX_ENCODED_BYTES,
  AVATAR_TARGET_DIMENSION,
} from "./constants";
import { normalizeAvatarRasterContentType } from "./policy";

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

/** Decode untrusted raster bytes to pixels and emit a bounded inert WebP URL. */
export async function rasterizeAvatarBlob(blob: Blob): Promise<string | null> {
  if (
    blob.size > AVATAR_MAX_DOWNLOAD_BYTES ||
    !normalizeAvatarRasterContentType(blob.type)
  ) {
    return null;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }

  try {
    if (bitmap.width === 0 || bitmap.height === 0) return null;
    const scale = Math.min(
      AVATAR_TARGET_DIMENSION / bitmap.width,
      AVATAR_TARGET_DIMENSION / bitmap.height,
      1,
    );
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const output = await canvas.convertToBlob({
      type: "image/webp",
      quality: 0.85,
    });
    if (output.size > AVATAR_MAX_ENCODED_BYTES) return null;

    const base64 = await arrayBufferToBase64(await output.arrayBuffer());
    return `data:${output.type};base64,${base64}`;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
