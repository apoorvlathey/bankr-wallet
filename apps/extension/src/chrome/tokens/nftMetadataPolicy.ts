import {
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";
import type { NftMetadata } from "./types";

export const MAX_NFT_METADATA_BYTES = 256 * 1024;
export const MAX_INLINE_NFT_URI_CHARS = 360_000;
const IPFS_GATEWAY_URL = "https://ipfs.io/ipfs/";

export function expandNftUri(rawUri: string, tokenId: bigint): string | null {
  if (!rawUri || rawUri.length > MAX_INLINE_NFT_URI_CHARS) return null;
  if (!rawUri.includes("{id}")) return rawUri;
  const hex = tokenId.toString(16).padStart(64, "0");
  return rawUri.replace(/\{id\}/g, hex);
}

export function resolveIpfsUri(uri: string): string {
  if (!uri.startsWith("ipfs://")) return uri;
  const path = uri.slice(7).replace(/^ipfs\//, "");
  return `${IPFS_GATEWAY_URL}${path}`;
}

function parseDataUri(uri: string): { mime: string; data: string } | null {
  if (!uri.startsWith("data:") || uri.length > MAX_INLINE_NFT_URI_CHARS) {
    return null;
  }
  const commaIndex = uri.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = uri.slice(5, commaIndex);
  const payload = uri.slice(commaIndex + 1);
  const isBase64 = meta.includes(";base64");
  const mime = (meta.split(";", 1)[0] || "text/plain").trim().toLowerCase();

  try {
    const data = isBase64 ? atob(payload) : decodeURIComponent(payload);
    if (data.length > MAX_NFT_METADATA_BYTES) return null;
    return { mime, data };
  } catch {
    return null;
  }
}

function safeImageSource(image: string): string | undefined {
  const resolved = resolveIpfsUri(image);
  if (isAllowedRemoteImageUrl(resolved)) return resolved;
  return sanitizeTrustedRendererImageSrc(resolved) || undefined;
}

function boundedString(value: unknown, maxChars: number): string | undefined {
  return typeof value === "string" && value.length <= maxChars
    ? value
    : undefined;
}

function parseMetadataJson(json: unknown): NftMetadata | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  const candidates = [
    record.image,
    record.image_url,
    record.imageUrl,
    record.image_data,
    record.animation_url,
  ];
  const rawImage = candidates.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return {
    name: boundedString(record.name, 256),
    description: boundedString(record.description, 2_048),
    image: rawImage ? safeImageSource(rawImage) : undefined,
  };
}

export function parseNftMetadataText(text: string): NftMetadata | null {
  try {
    return parseMetadataJson(JSON.parse(text));
  } catch {
    return null;
  }
}

export function resolveInlineNftMetadata(uri: string): NftMetadata | null {
  const parsed = parseDataUri(uri);
  if (!parsed) return null;
  if (
    parsed.mime.includes("json") ||
    parsed.data.trimStart().startsWith("{")
  ) {
    return parseNftMetadataText(parsed.data);
  }
  if (parsed.mime.startsWith("image/")) {
    const image = safeImageSource(uri);
    return image ? { image } : null;
  }
  return null;
}
