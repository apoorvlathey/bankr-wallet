import type { PortfolioToken } from "@/chrome/portfolio/api";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";
import type { ShieldPrivatePortfolio } from "./shieldOperation";
import { formatShieldWei } from "./shieldQuote";

export const SHIELDED_ETH_CHAIN_ID = PRIVACY_POOLS_DEPLOYMENT.chainId;
export const SHIELDED_ETH_NETWORK_NAME = PRIVACY_POOLS_DEPLOYMENT.chainName;
export const SHIELDED_ETH_EXPLORER_URL = PRIVACY_POOLS_DEPLOYMENT.explorerBaseUrl;
export const SHIELDED_ETH_ASSET_ID = "walletchan:shielded-eth";
export const SHIELDED_ETH_LOGO_URL = "/shielded-eth.svg";

export type ShieldedEthAction = "shield" | "unshield" | "send" | "activity";

export function isShieldedEthToken(
  token: Pick<PortfolioToken, "chainId" | "contractAddress"> | null | undefined,
): boolean {
  return token?.chainId === SHIELDED_ETH_CHAIN_ID &&
    token.contractAddress === SHIELDED_ETH_ASSET_ID;
}

/**
 * Renderer-only adapter for selectors that already consume PortfolioToken.
 * The sentinel address is intercepted before normal transfer preparation and
 * can never be submitted as a native/ERC-20 transfer.
 */
export function buildShieldedEthToken(
  portfolio: ShieldPrivatePortfolio,
): PortfolioToken {
  const balance = formatShieldWei(portfolio.readyBalanceWei);
  return {
    contractAddress: SHIELDED_ETH_ASSET_ID,
    chainId: SHIELDED_ETH_CHAIN_ID,
    name: "Shielded ETH",
    symbol: "ETH",
    decimals: 18,
    balance,
    balanceFormatted: balance,
    priceUsd: 0,
    valueUsd: 0,
    logoUrl: SHIELDED_ETH_LOGO_URL,
  };
}
