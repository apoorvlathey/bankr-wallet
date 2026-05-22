import { fetchPortfolio, type DefiPosition, type PortfolioToken } from "@/chrome/portfolioApi";
import { getCustomTokens } from "@/chrome/customTokenStorage";
import { getRecentReceivedTokens } from "@/chrome/recentlyReceivedTokens";
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
  /**
   * True when the upstream portfolio API failed. Native balances are still
   * resolved onchain in that case, but ERC-20 balances and DeFi positions
   * returned by the API are missing. The UI uses this to show a "Portfolio
   * unavailable" banner while still rendering native holdings.
   */
  apiUnavailable: boolean;
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

async function resolveErc20PricesBatch(
  requests: { chainId: number; contractAddress: string }[],
): Promise<Map<string, number>> {
  if (requests.length === 0) return new Map();

  try {
    const response = await new Promise<{
      success: boolean;
      data?: { chainId: number; contractAddress: string; priceUsd: number }[];
    }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "resolveCoinGeckoErc20Prices", requests },
        resolve,
      );
    });

    if (!response?.success || !response.data) return new Map();

    return new Map(
      response.data.map((entry) => [
        `${entry.chainId}-${entry.contractAddress.toLowerCase()}`,
        entry.priceUsd,
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
  const [portfolioResult, customTokens, networksInfo, recentReceived] =
    await Promise.all([
      fetchPortfolio(address).then(
        (data) => ({ ok: true as const, data }),
        (err) => ({ ok: false as const, err }),
      ),
      getCustomTokens(),
      getStoredNetworksInfo(),
      getRecentReceivedTokens(),
    ]);

  const apiUnavailable = !portfolioResult.ok;
  if (apiUnavailable) {
    console.warn("[portfolio] API unavailable, falling back to onchain native balances:", portfolioResult.err);
  }
  const data = portfolioResult.ok
    ? portfolioResult.data
    : { tokens: [], defiPositions: [], totalValueUsd: 0 };

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

  // Tokens the user just received in a recently-confirmed tx but the
  // upstream portfolio API hasn't re-indexed yet. Stubbed with whatever
  // metadata the extractor cached at receipt time — the on-chain balance
  // pass writes the live balance and Coingecko fills in price + logo on
  // the next render. Auto-expires after 5 min (see `recentlyReceivedTokens.ts`).
  const customKeys = new Set(
    customAsPortfolio.map(
      (ct) => `${ct.chainId}-${ct.contractAddress.toLowerCase()}`,
    ),
  );
  const recentAsPortfolio: PortfolioToken[] = recentReceived
    .filter((rt) => {
      const key = `${rt.chainId}-${rt.contractAddress.toLowerCase()}`;
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

  const mergedTokens = [...data.tokens, ...customAsPortfolio, ...recentAsPortfolio];
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
    .filter((chain) => !existingNativeChainIds.has(chain.chainId))
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

  const erc20PriceRequests = Array.from(
    new Map(
      tokensWithCustomNativePrices
        .filter(
          (token) =>
            !isNativeToken(token) &&
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
  );

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

  const finalTokens = tokensWithErc20Prices.map((token) => {
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
    apiUnavailable,
  };
}
