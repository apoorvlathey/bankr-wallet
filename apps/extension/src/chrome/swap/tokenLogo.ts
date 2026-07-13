import { TOKEN_METADATA_CACHE_TTL_MS } from "./constants";
import { getCachedTokenList } from "./tokenList";

const TOKEN_LOGO_CACHE_PREFIX = "tokenLogo:";

interface CachedTokenLogo {
  /** Empty string records a known-no-logo result. */
  logoUrl: string;
  fetchedAt: number;
}

export function tokenLogoCacheKey(chainId: number, address: string): string {
  return `${TOKEN_LOGO_CACHE_PREFIX}${chainId}:${address.toLowerCase()}`;
}

const inflightTokenLogo = new Map<string, Promise<string | null>>();

export async function getCachedTokenLogo(
  chainId: number,
  address: string,
): Promise<string | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  const cacheKey = tokenLogoCacheKey(chainId, address);
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey] as CachedTokenLogo | undefined;
  if (
    cached &&
    Date.now() - cached.fetchedAt < TOKEN_METADATA_CACHE_TTL_MS
  ) {
    return cached.logoUrl || null;
  }

  const inflight = inflightTokenLogo.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const list = await getCachedTokenList(chainId);
      const addressLower = address.toLowerCase();
      const entry = list.find(
        (token) => token.address.toLowerCase() === addressLower,
      );
      const logoUrl = entry?.logoURI || "";
      try {
        await chrome.storage.local.set({
          [cacheKey]: { logoUrl, fetchedAt: Date.now() } satisfies CachedTokenLogo,
        });
      } catch {
        // Cache writes are best-effort; callers can use the live result.
      }
      return logoUrl || null;
    } finally {
      inflightTokenLogo.delete(cacheKey);
    }
  })();
  inflightTokenLogo.set(cacheKey, promise);
  return promise;
}
