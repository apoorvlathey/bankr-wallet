import { chainHasNativeToken } from "@/constants/chainRegistry";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import { getNativeAssetMeta, getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";
import type { PortfolioToken } from "./api";
import { getPortfolioTokenKey } from "./hiddenTokens";
import type { TokenMetadata } from "./catalogTypes";

export function isTestnetChain(
  chainId: number,
  networksInfo: NetworksInfo,
): boolean {
  const chainName = getResolvedChainById(chainId, networksInfo)?.name;
  return getChainEnvironmentLabel(chainId, chainName) === "TESTNET";
}

export function isNativeToken(token: PortfolioToken): boolean {
  return (
    token.contractAddress === "native" ||
    token.contractAddress === "0x0000000000000000000000000000000000000000"
  );
}

export function applyTokenMetadata(
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

export function finalizePortfolioTokens(
  tokens: PortfolioToken[],
  hiddenTokenKeys: Set<string>,
  networksInfo: NetworksInfo,
): { visibleTokens: PortfolioToken[]; allTokenKeys: Set<string> } {
  const finalTokens = tokens
    .filter(
      (token) => !isNativeToken(token) || chainHasNativeToken(token.chainId),
    )
    .map((token) => {
      let next = token;
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
  return {
    visibleTokens,
    allTokenKeys: new Set(
      finalTokens.map((token) =>
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
    ),
  };
}
