import { readResponseTextBounded } from "./boundedHttpResponse";
import {
  isAllowedRasterImageContentType,
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

export interface NftMetadata {
  name?: string;
  description?: string;
  /** Safe renderer source: public HTTPS or bounded raster data only. */
  image?: string;
}

const NFT_FETCH_TIMEOUT_MS = 5_000;
const MAX_NFT_METADATA_BYTES = 256 * 1024;
const MAX_INLINE_URI_CHARS = 360_000;
const MAX_REDIRECTS = 3;
const IPFS_GATEWAY_URL = "https://ipfs.io/ipfs/";

function resolveIpfsUri(uri: string): string {
  if (!uri.startsWith("ipfs://")) return uri;
  const path = uri.slice(7).replace(/^ipfs\//, "");
  return `${IPFS_GATEWAY_URL}${path}`;
}

function parseDataUri(uri: string): { mime: string; data: string } | null {
  if (!uri.startsWith("data:") || uri.length > MAX_INLINE_URI_CHARS) return null;
  const commaIdx = uri.indexOf(",");
  if (commaIdx === -1) return null;
  const meta = uri.slice(5, commaIdx);
  const payload = uri.slice(commaIdx + 1);
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

function parseMetadataText(text: string): NftMetadata | null {
  try {
    return parseMetadataJson(JSON.parse(text));
  } catch {
    return null;
  }
}

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Resolve an onchain tokenURI without turning broad extension host permissions
 * into a private-network fetch primitive. Redirects are manually revalidated,
 * JSON is streamed under a strict byte ceiling, and SVG/HTML never becomes an
 * image source in the trusted renderer.
 */
export async function resolveNftMetadata(
  rawUri: string,
  tokenId: bigint,
): Promise<NftMetadata | null> {
  if (!rawUri || rawUri.length > MAX_INLINE_URI_CHARS) return null;

  let uri = rawUri;
  if (uri.includes("{id}")) {
    const hex = tokenId.toString(16).padStart(64, "0");
    uri = uri.replace(/\{id\}/g, hex);
  }

  if (uri.startsWith("data:")) {
    const parsed = parseDataUri(uri);
    if (!parsed) return null;
    if (parsed.mime.includes("json") || parsed.data.trimStart().startsWith("{")) {
      return parseMetadataText(parsed.data);
    }
    if (parsed.mime.startsWith("image/")) {
      const image = safeImageSource(uri);
      return image ? { image } : null;
    }
    return null;
  }

  let currentUrl = resolveIpfsUri(uri);
  if (!isAllowedRemoteImageUrl(currentUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NFT_FETCH_TIMEOUT_MS);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!isAllowedRemoteImageUrl(currentUrl)) return null;
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        if (redirectCount === MAX_REDIRECTS) {
          await cancelBody(response);
          return null;
        }
        const location = response.headers.get("location");
        await cancelBody(response);
        if (!location) return null;
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return null;
        }
        continue;
      }

      if (!response.ok) {
        await cancelBody(response);
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (isAllowedRasterImageContentType(contentType)) {
        await cancelBody(response);
        return { image: currentUrl };
      }
      if (contentType.trim().toLowerCase().startsWith("image/")) {
        await cancelBody(response);
        return null;
      }

      const text = await readResponseTextBounded(
        response,
        MAX_NFT_METADATA_BYTES,
      );
      return parseMetadataText(text);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
