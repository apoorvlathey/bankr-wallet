import { getNativeAssetMeta, getStoredNetworksInfo } from "@/lib/chains";

import { getCustomTokens } from "./customTokenStorage";
import { getCachedBungeeTokens } from "./bridgeApi";
import {
  fetchTokenInfo,
  getCachedTokenLogo,
  NATIVE_TOKEN_ADDRESS,
} from "./swapApi";
import { KNOWN_TOKEN_LOGOS } from "./tokenLogoConstants";
import { fetchAndCacheAvatarImage } from "./avatarImageCache";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

interface ResolveTokenMetadataOptions {
  includeCustomTokens?: boolean;
  includeBungeeTokens?: boolean;
}

function normalizeTokenAddress(address: string): string | null {
  const lower = address.toLowerCase();
  if (
    lower === "native" ||
    lower === ZERO_ADDRESS ||
    lower === NATIVE_TOKEN_ADDRESS.toLowerCase()
  ) {
    return "native";
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? lower : null;
}

function warmLogoImageCache(logoUrl: string | undefined): void {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return;
  fetchAndCacheAvatarImage(logoUrl).catch(() => {});
}

async function resolveNativeMetadata(chainId: number): Promise<TokenMetadata> {
  const networksInfo = await getStoredNetworksInfo().catch(() => undefined);
  const native = getNativeAssetMeta(chainId, networksInfo);
  if (native) {
    const metadata = {
      name: native.name,
      symbol: native.symbol,
      decimals: native.decimals,
      logoUrl: native.logoUrl || undefined,
    };
    warmLogoImageCache(metadata.logoUrl);
    return metadata;
  }

  const info = await fetchTokenInfo(NATIVE_TOKEN_ADDRESS, chainId).catch(
    () => null,
  );
  return info ?? {};
}

async function lookupBungeeToken(
  chainId: number,
  addressLower: string,
): Promise<TokenMetadata> {
  const tokens = await getCachedBungeeTokens(chainId).catch(() => []);
  const match = tokens.find(
    (token) => token.address.toLowerCase() === addressLower,
  );
  if (!match) return {};
  return {
    name: match.name,
    symbol: match.symbol,
    decimals: match.decimals,
    logoUrl: match.logoURI || match.icon || undefined,
  };
}

async function lookupCustomToken(
  chainId: number,
  addressLower: string,
): Promise<TokenMetadata> {
  const tokens = await getCustomTokens().catch(() => []);
  const match = tokens.find(
    (token) =>
      token.chainId === chainId && token.contractAddress === addressLower,
  );
  if (!match) return {};
  return {
    name: match.name,
    symbol: match.symbol,
    decimals: match.decimals,
    logoUrl: match.image,
  };
}

const inflightMetadata = new Map<string, Promise<TokenMetadata>>();

/**
 * Resolve token display metadata through the same sources used by swap,
 * bridge, watched assets, and clear-signing surfaces. This keeps tx history,
 * portfolio auto-add stubs, and selectors from drifting when a chain is
 * supported by only one upstream token list.
 */
export async function resolveTokenMetadata(
  chainId: number,
  address: string,
  options: ResolveTokenMetadataOptions = {},
): Promise<TokenMetadata> {
  const normalized = normalizeTokenAddress(address);
  if (!normalized) return {};
  if (normalized === "native") return resolveNativeMetadata(chainId);

  const includeCustomTokens = options.includeCustomTokens ?? true;
  const includeBungeeTokens = options.includeBungeeTokens ?? true;
  const cacheKey = [
    chainId,
    normalized,
    includeCustomTokens ? "custom" : "public",
    includeBungeeTokens ? "bungee" : "no-bungee",
  ].join(":");
  const inflight = inflightMetadata.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const [info, swapLogo, bungee, custom] = await Promise.all([
      fetchTokenInfo(normalized, chainId).catch(() => null),
      getCachedTokenLogo(chainId, normalized).catch(() => null),
      includeBungeeTokens
        ? lookupBungeeToken(chainId, normalized)
        : Promise.resolve({} as TokenMetadata),
      includeCustomTokens
        ? lookupCustomToken(chainId, normalized)
        : Promise.resolve({} as TokenMetadata),
    ]);

    const metadata = {
      name: info?.name ?? bungee.name ?? custom.name,
      symbol: info?.symbol ?? bungee.symbol ?? custom.symbol,
      decimals: info?.decimals ?? bungee.decimals ?? custom.decimals,
      logoUrl:
        swapLogo ||
        bungee.logoUrl ||
        custom.logoUrl ||
        KNOWN_TOKEN_LOGOS[normalized] ||
        undefined,
    };
    warmLogoImageCache(metadata.logoUrl);
    return metadata;
  })().finally(() => {
    inflightMetadata.delete(cacheKey);
  });

  inflightMetadata.set(cacheKey, promise);
  return promise;
}

export async function resolveTokenLogoUrl(
  chainId: number,
  address: string,
): Promise<string | null> {
  return (
    await resolveTokenMetadata(chainId, address, {
      includeCustomTokens: false,
    })
  ).logoUrl ?? null;
}
