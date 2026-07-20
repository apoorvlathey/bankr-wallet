import {
  TOKEN_LOGO_MISS_CACHE_TTL_MS,
  TOKEN_METADATA_CACHE_TTL_MS,
} from "./constants";
import { getCachedTokenList } from "./tokenList";
import { fetchFallbackTokenLogo } from "./tokenLogoFallback";

const TOKEN_LOGO_CACHE_PREFIX = "tokenLogo:";
const TOKEN_LOGO_FALLBACK_VERSION = 1;
interface CachedTokenLogo {
  logoUrl: string;
  fetchedAt: number;
  fallbackVersion?: number;
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
  const cacheTtl = cached?.logoUrl
    ? TOKEN_METADATA_CACHE_TTL_MS
    : TOKEN_LOGO_MISS_CACHE_TTL_MS;
  if (
    cached &&
    (cached.logoUrl || cached.fallbackVersion === TOKEN_LOGO_FALLBACK_VERSION) &&
    Date.now() - cached.fetchedAt < cacheTtl
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
      const logoUrl =
        entry?.logoURI ||
        (await fetchFallbackTokenLogo(chainId, addressLower).catch(() => null)) ||
        "";
      try {
        await chrome.storage.local.set({
          [cacheKey]: { logoUrl, fetchedAt: Date.now(), fallbackVersion: TOKEN_LOGO_FALLBACK_VERSION } satisfies CachedTokenLogo,
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
