import type { PortfolioToken } from "./api";
import {
  resolveCustomNativePricesBatch,
  resolveTokenMetadataBatch,
} from "./catalogEnrichment";
import {
  applyTokenMetadata,
  isNativeToken,
  isTestnetChain,
} from "./catalogTransforms";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";

/**
 * Enrich one rendered token page without refetching the complete portfolio.
 * The caller bounds page size, so metadata messages and native price lookups
 * remain proportional to what the user can currently see.
 */
export async function enrichPortfolioTokenPage(
  tokens: PortfolioToken[],
): Promise<PortfolioToken[]> {
  if (tokens.length === 0) return [];
  const networksInfo = await getStoredNetworksInfo();
  const visibleChainsById = new Map(
    getVisibleChains(networksInfo).map((chain) => [chain.chainId, chain] as const),
  );
  const metadataRequests = Array.from(
    new Map(
      tokens
        .filter(
          (token) =>
            !isNativeToken(token) &&
            (!token.logoUrl || !token.symbol || !token.name) &&
            /^0x[a-fA-F0-9]{40}$/.test(token.contractAddress),
        )
        .map((token) => {
          const contractAddress = token.contractAddress.toLowerCase();
          return [
            `${token.chainId}-${contractAddress}`,
            { chainId: token.chainId, contractAddress },
          ] as const;
        }),
    ).values(),
  );
  const nativePriceRequests = Array.from(
    new Map(
      tokens
        .filter((token) => {
          const chain = visibleChainsById.get(token.chainId);
          return (
            isNativeToken(token) &&
            !!chain &&
            token.priceUsd <= 0 &&
            !isTestnetChain(token.chainId, networksInfo)
          );
        })
        .map((token) => {
          const chain = visibleChainsById.get(token.chainId)!;
          return [
            token.chainId,
            {
              chainId: token.chainId,
              chainName: chain.name,
              nativeCurrencyName: chain.nativeCurrency.name,
              symbol: chain.nativeCurrency.symbol,
            },
          ] as const;
        }),
    ).values(),
  );
  const [metadata, nativePrices] = await Promise.all([
    resolveTokenMetadataBatch(metadataRequests),
    resolveCustomNativePricesBatch(nativePriceRequests),
  ]);

  return tokens.map((token) => {
    const contractAddress = token.contractAddress.toLowerCase();
    const withMetadata = applyTokenMetadata(
      token,
      metadata.get(`${token.chainId}-${contractAddress}`),
    );
    if (!isNativeToken(withMetadata) || withMetadata.priceUsd > 0) {
      return withMetadata;
    }
    const resolved = nativePrices.get(withMetadata.chainId);
    if (!resolved || resolved.priceUsd <= 0) return withMetadata;
    const balance = Number(withMetadata.balance);
    return {
      ...withMetadata,
      priceUsd: resolved.priceUsd,
      valueUsd:
        Number.isFinite(balance) && balance > 0
          ? balance * resolved.priceUsd
          : 0,
      logoUrl: resolved.logoUrl || withMetadata.logoUrl,
    };
  });
}
