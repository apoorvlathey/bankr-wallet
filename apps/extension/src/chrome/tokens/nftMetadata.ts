import { isAllowedRasterImageContentType, isAllowedRemoteImageUrl } from "@/lib/remoteImagePolicy";
import { readResponseTextBounded } from "../network/boundedHttp";
import {
  expandNftUri,
  MAX_NFT_METADATA_BYTES,
  parseNftMetadataText,
  resolveInlineNftMetadata,
  resolveIpfsUri,
} from "./nftMetadataPolicy";
import type { NftMetadata } from "./types";

const NFT_FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Resolve tokenURI metadata without turning broad extension host permissions
 * into a private-network fetch primitive. Every redirect is revalidated, JSON
 * is streamed under a byte ceiling, and active image formats are discarded.
 */
export async function resolveNftMetadata(
  rawUri: string,
  tokenId: bigint,
): Promise<NftMetadata | null> {
  const expandedUri = expandNftUri(rawUri, tokenId);
  if (!expandedUri) return null;
  if (expandedUri.startsWith("data:")) {
    return resolveInlineNftMetadata(expandedUri);
  }

  let currentUrl = resolveIpfsUri(expandedUri);
  if (!isAllowedRemoteImageUrl(currentUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NFT_FETCH_TIMEOUT_MS);
  try {
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
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
      return parseNftMetadataText(text);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
