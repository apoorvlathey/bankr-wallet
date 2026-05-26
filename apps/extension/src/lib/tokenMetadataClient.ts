import { requestAvatarImageFetch } from "@/lib/avatarCacheClient";

export interface TokenDisplayMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

const metadataCache = new Map<string, TokenDisplayMetadata | null>();
const inflight = new Map<string, Promise<TokenDisplayMetadata | null>>();

function cacheKey(chainId: number, tokenAddress: string): string {
  return `${chainId}:${tokenAddress.toLowerCase()}`;
}

function warmLogo(url: string | undefined): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  requestAvatarImageFetch(url).catch(() => {});
}

export function getCachedTokenMetadataSync(
  chainId: number,
  tokenAddress: string,
): TokenDisplayMetadata | null | undefined {
  return metadataCache.get(cacheKey(chainId, tokenAddress));
}

export function resolveTokenMetadataClient(
  chainId: number,
  tokenAddress: string,
): Promise<TokenDisplayMetadata | null> {
  const key = cacheKey(chainId, tokenAddress);
  if (metadataCache.has(key)) return Promise.resolve(metadataCache.get(key)!);

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = new Promise<TokenDisplayMetadata | null>((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: "resolveTokenMetadata",
          chainId,
          tokenAddress,
        },
        (response: {
          success?: boolean;
          data?: TokenDisplayMetadata | null;
        }) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const metadata = response?.success ? response.data ?? null : null;
          if (metadata?.logoUrl) warmLogo(metadata.logoUrl);
          if (
            metadata?.name ||
            metadata?.symbol ||
            metadata?.logoUrl ||
            typeof metadata?.decimals === "number"
          ) {
            metadataCache.set(key, metadata);
          } else {
            metadataCache.delete(key);
          }
          resolve(metadata);
        },
      );
    } catch {
      resolve(null);
    }
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
