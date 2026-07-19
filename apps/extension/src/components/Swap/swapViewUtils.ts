import { formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { NATIVE_TOKEN_ADDRESS } from "@/chrome/swapApi";
import { SWAP_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import type { PreparedDelegation } from "./swapViewTypes";

export const formatOutputAmount = (amount: string, decimals: number): string =>
  formatTokenAmountFromBase(amount, decimals);

/** Keep quote summaries readable without hiding exact values behind ellipses. */
export function formatQuoteSummaryAmount(amount: string): string {
  if (amount.length <= 12) return amount;
  const value = Number(amount);
  if (!Number.isFinite(value) || Math.abs(value) < 1_000) return amount;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumSignificantDigits: 6,
  }).format(value);
}

/** Highest-value funded token from the cached portfolio snapshot. */
export function pickDefaultSwapSellToken(
  tokens: readonly PortfolioToken[],
  chainId?: number,
): PortfolioToken | null {
  const funded = tokens.filter(
    (token) =>
      SWAP_SUPPORTED_CHAIN_IDS.has(token.chainId) &&
      (chainId === undefined || token.chainId === chainId) &&
      (token.valueUsd > 0 || parseFloat(token.balance || "0") > 0),
  );
  if (funded.length === 0) return null;
  return funded.reduce((best, token) =>
    token.valueUsd > best.valueUsd ? token : best,
  );
}

export function to0xToken(token: PortfolioToken): string {
  return token.contractAddress === "native"
    ? NATIVE_TOKEN_ADDRESS
    : token.contractAddress;
}

export function buildFlippedSellToken(args: {
  buyTokenAddress: string;
  buyTokenInfo: { symbol: string; name: string; decimals: number } | null;
  buyTokenPriceUsd: number;
  buyTokenLogoURI?: string;
  buyChainId: number;
  holdings: readonly PortfolioToken[];
}): PortfolioToken | null {
  const address = args.buyTokenAddress.trim();
  if (!args.buyTokenInfo || !address) return null;
  const isNative = address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const held = args.holdings.find(
    (token) => token.chainId === args.buyChainId &&
      (token.contractAddress.toLowerCase() === address.toLowerCase() ||
        (isNative && token.contractAddress === "native")),
  );
  return held ?? {
    symbol: args.buyTokenInfo.symbol,
    name: args.buyTokenInfo.name,
    contractAddress: isNative ? "native" : address,
    chainId: args.buyChainId,
    decimals: args.buyTokenInfo.decimals,
    balance: "0",
    balanceFormatted: "0",
    priceUsd: args.buyTokenPriceUsd,
    valueUsd: 0,
    logoUrl: args.buyTokenLogoURI,
  };
}

export function resolveSwapDelegate(
  accountId: string,
  chainId: number,
): Promise<PreparedDelegation | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId, chainId },
      (res: any) => {
        if (chrome.runtime.lastError || !res?.success || !res?.delegate) {
          resolve(null);
          return;
        }
        resolve({
          delegate: res.delegate,
          needsAuth: Boolean(res.needsAuthorization),
          onchainDelegate: res.onchainDelegate ?? null,
        });
      },
    );
  });
}
