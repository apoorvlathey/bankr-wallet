import { fetchPortfolio, type DefiPosition, type PortfolioToken } from "@/chrome/portfolioApi";
import { getCustomTokens } from "@/chrome/customTokenStorage";
import { getStoredNetworksInfo, getVisibleChains, getResolvedChainById } from "@/lib/chains";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import type { NetworksInfo } from "@/types";

function isTestnetChain(chainId: number, networksInfo: NetworksInfo): boolean {
  const chainName = getResolvedChainById(chainId, networksInfo)?.name;
  return getChainEnvironmentLabel(chainId, chainName) === "TESTNET";
}

function isNativeToken(token: PortfolioToken): boolean {
  return (
    token.contractAddress === "native" ||
    token.contractAddress === "0x0000000000000000000000000000000000000000"
  );
}

export interface PortfolioTokenCatalog {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
}

async function resolveCustomNativePricesBatch(
  requests: { chainId: number; chainName: string; nativeCurrencyName: string; symbol: string }[],
): Promise<Map<number, { priceUsd: number; logoUrl?: string }>> {
  if (requests.length === 0) return new Map();

  try {
    const response = await new Promise<{
      success: boolean;
      data?: { priceUsd: number; logoUrl?: string }[];
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "resolveCoinGeckoNativeAssets",
          requests,
        },
        resolve,
      );
    });

    if (!response?.success || !response.data) {
      return new Map();
    }

    return new Map(
      requests.map((request, index) => [
        request.chainId,
        response.data?.[index] || { priceUsd: 0 },
      ]),
    );
  } catch {
    return new Map();
  }
}

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
): Promise<PortfolioTokenCatalog> {
  const [data, customTokens, networksInfo] = await Promise.all([
    fetchPortfolio(address),
    getCustomTokens(),
    getStoredNetworksInfo(),
  ]);

  const apiTokenKeys = new Set(
    data.tokens.map((t) => `${t.chainId}-${t.contractAddress.toLowerCase()}`),
  );

  const customAsPortfolio: PortfolioToken[] = customTokens
    .filter((ct) => !apiTokenKeys.has(`${ct.chainId}-${ct.contractAddress}`))
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

  const mergedTokens = [...data.tokens, ...customAsPortfolio];
  const existingNativeChainIds = new Set(
    mergedTokens
      .filter(
        (t) =>
          t.contractAddress === "native" ||
          t.contractAddress === "0x0000000000000000000000000000000000000000",
      )
      .map((t) => t.chainId),
  );

  const customChainNativeTokens: PortfolioToken[] = getVisibleChains(networksInfo)
    .filter((chain) => chain.isCustom && !existingNativeChainIds.has(chain.chainId))
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

  const customChainById = new Map(
    getVisibleChains(networksInfo)
      .filter((chain) => chain.isCustom)
      .map((chain) => [chain.chainId, chain] as const),
  );

  const customNativeRequests = Array.from(
    new Map(
      [...mergedTokens, ...customChainNativeTokens]
        .filter((token) => {
          const customChain = customChainById.get(token.chainId);
          return (
            isNativeToken(token) &&
            !!customChain &&
            token.priceUsd <= 0 &&
            !isTestnetChain(token.chainId, networksInfo)
          );
        })
        .map((token) => {
          const customChain = customChainById.get(token.chainId)!;
          return [
            token.chainId,
            {
              chainId: token.chainId,
              chainName: customChain.name,
              nativeCurrencyName: customChain.nativeCurrency.name,
              symbol: customChain.nativeCurrency.symbol,
            },
          ] as const;
        }),
    ).values(),
  );

  const customNativePrices = await resolveCustomNativePricesBatch(
    customNativeRequests,
  );

  const tokensWithCustomNativePrices = await Promise.all(
    [...mergedTokens, ...customChainNativeTokens].map(async (token) => {
      const isNative =
        token.contractAddress === "native" ||
        token.contractAddress === "0x0000000000000000000000000000000000000000";
      const customChain = customChainById.get(token.chainId);
      if (!isNative || !customChain || token.priceUsd > 0) {
        return token;
      }

      const { priceUsd, logoUrl } =
        customNativePrices.get(token.chainId) || { priceUsd: 0 };
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

  const finalTokens = tokensWithCustomNativePrices.map((token) => {
    if (isNativeToken(token) && isTestnetChain(token.chainId, networksInfo)) {
      return { ...token, priceUsd: 0, valueUsd: 0 };
    }
    return token;
  });

  const totalValueUsd = finalTokens.reduce((sum, t) => sum + t.valueUsd, 0) +
    (data.defiPositions || []).reduce((sum, p) => sum + p.valueUsd, 0);

  return {
    tokens: finalTokens,
    defiPositions: data.defiPositions || [],
    totalValueUsd,
    customTokenKeys: new Set(
      customTokens.map((ct) => `${ct.chainId}-${ct.contractAddress}`),
    ),
  };
}
