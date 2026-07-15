import { fetchPortfolio, type PortfolioToken } from "./api";
import { getCustomTokens } from "../customTokenStorage";
import { getHiddenPortfolioTokenKeys, getPortfolioTokenKey } from "./hiddenTokens";
import { getRecentReceivedTokens } from "./recentTokens";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import {
  resolveCustomNativePricesBatch,
  resolveErc20PricesBatch,
  resolveTokenMetadataBatch,
} from "./catalogEnrichment";
import {
  applyTokenMetadata,
  finalizePortfolioTokens,
  isNativeToken,
  isTestnetChain,
} from "./catalogTransforms";
import type {
  LoadPortfolioTokenCatalogOptions,
  PortfolioTokenCatalog,
  TokenMetadata,
} from "./catalogTypes";

export type {
  LoadPortfolioTokenCatalogOptions,
  PortfolioTokenCatalog,
} from "./catalogTypes";

/**
 * Shared portfolio token catalog used by Holdings, Send, and Swap.
 *
 * It merges:
 * - website portfolio API tokens
 * - user-added custom ERC-20s not returned by the API
 * - native token placeholders for visible custom chains
 */
export async function loadPortfolioTokenCatalog(
  address: string,
  options: LoadPortfolioTokenCatalogOptions = {},
): Promise<PortfolioTokenCatalog> {
  const enrich = options.enrich ?? true;
  const includeErc20PriceFallback =
    options.includeErc20PriceFallback ?? true;
  const shouldEnrichToken = (token: PortfolioToken) =>
    !options.enrichTokenKeys ||
    options.enrichTokenKeys.has(
      getPortfolioTokenKey(token.chainId, token.contractAddress),
    );
  const [
    portfolioResult,
    customTokens,
    networksInfo,
    recentReceived,
    hiddenTokenKeys,
  ] =
    await Promise.all([
      fetchPortfolio(address).then(
        (data) => ({ ok: true as const, data }),
        (err) => ({ ok: false as const, err }),
      ),
      getCustomTokens(),
      getStoredNetworksInfo(),
      getRecentReceivedTokens(),
      getHiddenPortfolioTokenKeys(),
    ]);

  const apiUnavailable = !portfolioResult.ok;
  if (apiUnavailable) {
    console.warn("[portfolio] API unavailable, falling back to onchain native balances:", portfolioResult.err);
  }
  const data = portfolioResult.ok
    ? portfolioResult.data
    : { tokens: [], defiPositions: [], totalValueUsd: 0 };

  const customTokenKeys = new Set(
    customTokens.map((ct) =>
      getPortfolioTokenKey(ct.chainId, ct.contractAddress),
    ),
  );
  const recentReceivedTokenKeys = new Set(
    recentReceived.map((rt) =>
      getPortfolioTokenKey(rt.chainId, rt.contractAddress),
    ),
  );

  const apiTokenKeys = new Set(
    data.tokens.map((t) =>
      getPortfolioTokenKey(t.chainId, t.contractAddress),
    ),
  );

  const customAsPortfolio: PortfolioToken[] = customTokens
    .filter(
      (ct) =>
        !apiTokenKeys.has(
          getPortfolioTokenKey(ct.chainId, ct.contractAddress),
        ),
    )
    .map((ct) => ({
      symbol: ct.symbol,
      name: ct.name,
      contractAddress: ct.contractAddress,
      chainId: ct.chainId,
      decimals: ct.decimals,
      balance: "0",
      balanceFormatted: "0",
      priceUsd: 0,
      valueUsd: 0,
      logoUrl: undefined,
    }));

  // Tokens the user just received in a recently-confirmed tx but the
  // upstream portfolio API hasn't re-indexed yet. Stubbed with whatever
  // metadata the extractor cached at receipt time — the on-chain balance
  // pass writes the live balance and Coingecko fills in price + logo on
  // the next render. Auto-expires after 5 min (see `recentTokens.ts`).
  const customKeys = new Set(
    customAsPortfolio.map(
      (ct) => getPortfolioTokenKey(ct.chainId, ct.contractAddress),
    ),
  );
  const recentAsPortfolio: PortfolioToken[] = recentReceived
    .filter((rt) => {
      const key = getPortfolioTokenKey(rt.chainId, rt.contractAddress);
      return !apiTokenKeys.has(key) && !customKeys.has(key);
    })
    .map((rt) => ({
      symbol: rt.symbol ?? "",
      name: rt.name ?? rt.symbol ?? "",
      contractAddress: rt.contractAddress,
      chainId: rt.chainId,
      decimals: rt.decimals ?? 18,
      balance: "0",
      balanceFormatted: "0",
      priceUsd: 0,
      valueUsd: 0,
      logoUrl: rt.logoUrl,
    }));

  const metadataRequests = Array.from(
    new Map(
      [...data.tokens, ...customAsPortfolio, ...recentAsPortfolio]
        .filter(
          (token) =>
            shouldEnrichToken(token) &&
            !isNativeToken(token) &&
            (!token.logoUrl || !token.symbol || !token.name) &&
            /^0x[a-fA-F0-9]{40}$/.test(token.contractAddress),
        )
        .map((token) => {
          const addr = token.contractAddress.toLowerCase();
          return [
            `${token.chainId}-${addr}`,
            { chainId: token.chainId, contractAddress: addr },
          ] as const;
        }),
    ).values(),
  );
  const resolvedTokenMetadata = enrich
    ? await resolveTokenMetadataBatch(metadataRequests)
    : new Map<string, TokenMetadata>();

  const mergedTokens = [
    ...data.tokens,
    ...customAsPortfolio,
    ...recentAsPortfolio,
  ].map((token) =>
    applyTokenMetadata(
      token,
      resolvedTokenMetadata.get(
        `${token.chainId}-${token.contractAddress.toLowerCase()}`,
      ),
    ),
  );
  const existingNativeChainIds = new Set(
    mergedTokens
      .filter(
        (t) =>
          t.contractAddress === "native" ||
          t.contractAddress === "0x0000000000000000000000000000000000000000",
      )
      .map((t) => t.chainId),
  );

  const visibleChains = getVisibleChains(networksInfo);
  const visibleChainsById = new Map(
    visibleChains.map((chain) => [chain.chainId, chain] as const),
  );

  // Add a native token placeholder for every visible chain the API didn't
  // already cover. The upstream portfolio API only returns data for a handful
  // of chains, so without this we'd silently skip native balances on every
  // other built-in chain (MegaETH, BNB, Arbitrum, …) plus all user-added
  // custom chains.
  const missingNativeTokens: PortfolioToken[] = visibleChains
    .filter(
      (chain) =>
        chain.hasNativeToken && !existingNativeChainIds.has(chain.chainId),
    )
    .map((chain) => ({
      symbol: chain.nativeCurrency.symbol,
      name: chain.nativeCurrency.name,
      contractAddress: "native",
      chainId: chain.chainId,
      decimals: chain.nativeCurrency.decimals,
      balance: "0",
      balanceFormatted: "0",
      priceUsd: 0,
      valueUsd: 0,
      logoUrl: undefined,
    }));

  if (!enrich) {
    const { visibleTokens, allTokenKeys } = finalizePortfolioTokens(
      [...mergedTokens, ...missingNativeTokens],
      hiddenTokenKeys,
      networksInfo,
    );
    const totalValueUsd =
      visibleTokens.reduce((sum, t) => sum + t.valueUsd, 0) +
      (data.defiPositions || []).reduce((sum, p) => sum + p.valueUsd, 0);

    return {
      tokens: visibleTokens,
      defiPositions: data.defiPositions || [],
      totalValueUsd,
      customTokenKeys,
      recentReceivedTokenKeys,
      allTokenKeys,
      hiddenTokenKeys,
      apiUnavailable,
    };
  }

  const nativePriceRequests = Array.from(
    new Map(
      [...mergedTokens, ...missingNativeTokens]
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

  const resolvedNativePrices = await resolveCustomNativePricesBatch(
    nativePriceRequests,
  );

  const tokensWithCustomNativePrices = await Promise.all(
    [...mergedTokens, ...missingNativeTokens].map(async (token) => {
      const isNative =
        token.contractAddress === "native" ||
        token.contractAddress === "0x0000000000000000000000000000000000000000";
      const chain = visibleChainsById.get(token.chainId);
      if (!isNative || !chain || token.priceUsd > 0) {
        return token;
      }

      const { priceUsd, logoUrl } =
        resolvedNativePrices.get(token.chainId) || { priceUsd: 0 };
      if (priceUsd <= 0) return token;

      const balanceNum = parseFloat(token.balance || "0");
      return {
        ...token,
        priceUsd,
        valueUsd: balanceNum > 0 ? balanceNum * priceUsd : 0,
        logoUrl: logoUrl || token.logoUrl,
      };
    }),
  );

  const erc20PriceRequests = includeErc20PriceFallback
    ? Array.from(
        new Map(
          tokensWithCustomNativePrices
            .filter(
              (token) =>
                !isNativeToken(token) &&
                shouldEnrichToken(token) &&
                token.priceUsd <= 0 &&
                visibleChainsById.has(token.chainId) &&
                !isTestnetChain(token.chainId, networksInfo) &&
                /^0x[a-fA-F0-9]{40}$/.test(token.contractAddress),
            )
            .map((token) => {
              const addr = token.contractAddress.toLowerCase();
              return [
                `${token.chainId}-${addr}`,
                { chainId: token.chainId, contractAddress: addr },
              ] as const;
            }),
        ).values(),
      )
    : [];

  const resolvedErc20Prices = await resolveErc20PricesBatch(erc20PriceRequests);

  const tokensWithErc20Prices = tokensWithCustomNativePrices.map((token) => {
    if (isNativeToken(token) || token.priceUsd > 0) return token;
    const price = resolvedErc20Prices.get(
      `${token.chainId}-${token.contractAddress.toLowerCase()}`,
    );
    if (!price || price <= 0) return token;
    const balanceNum = parseFloat(token.balance || "0");
    return {
      ...token,
      priceUsd: price,
      valueUsd: balanceNum > 0 ? balanceNum * price : 0,
    };
  });

  const { visibleTokens, allTokenKeys } = finalizePortfolioTokens(
    tokensWithErc20Prices,
    hiddenTokenKeys,
    networksInfo,
  );

  const totalValueUsd = visibleTokens.reduce((sum, t) => sum + t.valueUsd, 0) +
    (data.defiPositions || []).reduce((sum, p) => sum + p.valueUsd, 0);

  return {
    tokens: visibleTokens,
    defiPositions: data.defiPositions || [],
    totalValueUsd,
    customTokenKeys,
    recentReceivedTokenKeys,
    allTokenKeys,
    hiddenTokenKeys,
    apiUnavailable,
  };
}
