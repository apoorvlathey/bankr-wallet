import { fetchPortfolio, type DefiPosition, type PortfolioToken } from "@/chrome/portfolioApi";
import { getCustomTokens } from "@/chrome/customTokenStorage";
import {
  getHiddenPortfolioTokenKeys,
  getPortfolioTokenKey,
} from "@/chrome/hiddenPortfolioTokens";
import { getRecentReceivedTokens } from "@/chrome/recentlyReceivedTokens";
import {
  getStoredNetworksInfo,
  getVisibleChains,
  getResolvedChainById,
  getNativeAssetMeta,
} from "@/lib/chains";
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

interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

export interface PortfolioTokenCatalog {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
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

async function resolveTokenMetadataBatch(
  requests: { chainId: number; contractAddress: string }[],
): Promise<Map<string, TokenMetadata>> {
  if (requests.length === 0) return new Map();

  const entries = await Promise.all(
    requests.map(
      (request) =>
        new Promise<[
          string,
          TokenMetadata | null,
        ]>((resolve) => {
          const address = request.contractAddress.toLowerCase();
          chrome.runtime.sendMessage(
            {
              type: "resolveTokenMetadata",
              chainId: request.chainId,
              tokenAddress: address,
            },
            (response) => {
              resolve([
                `${request.chainId}-${address}`,
                response?.success ? response.data ?? null : null,
              ]);
            },
          );
        }),
    ),
  );

  return new Map(
    entries.filter(
      (entry): entry is [string, TokenMetadata] => entry[1] !== null,
    ),
  );
}

function applyTokenMetadata(
  token: PortfolioToken,
  metadata: TokenMetadata | undefined,
): PortfolioToken {
  if (!metadata) return token;
  const logoUrl = token.logoUrl || metadata.logoUrl;
  const symbol = token.symbol || metadata.symbol || token.symbol;
  const name = token.name || metadata.name || metadata.symbol || token.name;
  const decimals = token.decimals ?? metadata.decimals ?? 18;
  if (
    logoUrl === token.logoUrl &&
    symbol === token.symbol &&
    name === token.name &&
    decimals === token.decimals
  ) {
    return token;
  }
  return { ...token, logoUrl, symbol, name, decimals };
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
  // the next render. Auto-expires after 5 min (see `recentlyReceivedTokens.ts`).
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
  const resolvedTokenMetadata =
    await resolveTokenMetadataBatch(metadataRequests);

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
    let next = token;
    // Native tokens without a logo fall back to the chain icon so non-ETH
    // natives on custom chains (AVAX on Avalanche, BNB on non-registry BNB
    // chains, …) render the correct asset image instead of an initials chip.
    if (isNativeToken(next) && !next.logoUrl) {
      const meta = getNativeAssetMeta(next.chainId, networksInfo);
      if (meta?.logoUrl) next = { ...next, logoUrl: meta.logoUrl };
    }
    if (isNativeToken(next) && isTestnetChain(next.chainId, networksInfo)) {
      next = { ...next, priceUsd: 0, valueUsd: 0 };
    }
    return next;
  });

  const visibleTokens = finalTokens.filter(
    (token) =>
      !hiddenTokenKeys.has(
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
  );
  const allTokenKeys = new Set(
    finalTokens.map((token) =>
      getPortfolioTokenKey(token.chainId, token.contractAddress),
    ),
  );

  const totalValueUsd = visibleTokens.reduce((sum, t) => sum + t.valueUsd, 0) +
    (data.defiPositions || []).reduce((sum, p) => sum + p.valueUsd, 0);

  return {
    tokens: visibleTokens,
    defiPositions: data.defiPositions || [],
    totalValueUsd,
    customTokenKeys: new Set(
      customTokens.map((ct) =>
        getPortfolioTokenKey(ct.chainId, ct.contractAddress),
      ),
    ),
    allTokenKeys,
    hiddenTokenKeys,
    apiUnavailable,
  };
}
