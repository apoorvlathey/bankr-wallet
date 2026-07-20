import type { PortfolioToken } from "./api";

export const INTERACTIVE_PORTFOLIO_TOKEN_LIMIT = 200;
export const MANAGE_PORTFOLIO_TOKEN_LIMIT = 300;
export const TOKEN_PICKER_PAGE_SIZE = 60;

function tokenKey(token: PortfolioToken): string {
  return `${token.chainId}-${token.contractAddress.toLowerCase()}`;
}

function isNative(token: PortfolioToken): boolean {
  const address = token.contractAddress.toLowerCase();
  return address === "native" || address === "0x0000000000000000000000000000000000000000";
}

/**
 * Keeps interactive views proportional to what they can use. Native assets,
 * user-added assets, recent receipts, and an already-selected asset win before
 * the catalog's highest-value ordering fills the remaining slots.
 */
export function selectPortfolioTokensForInteraction(
  tokens: readonly PortfolioToken[],
  priorityKeys: ReadonlySet<string> = new Set(),
  limit = INTERACTIVE_PORTFOLIO_TOKEN_LIMIT,
): PortfolioToken[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0 || tokens.length === 0) return [];

  const unique = new Map<string, PortfolioToken>();
  for (const token of tokens) {
    const key = tokenKey(token);
    if (!unique.has(key)) unique.set(key, token);
  }

  const ranked = Array.from(unique.values()).sort((a, b) => {
    const aPriority = priorityKeys.has(tokenKey(a)) || isNative(a);
    const bPriority = priorityKeys.has(tokenKey(b)) || isNative(b);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;
    if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
    const balanceDifference = (Number(b.balance) || 0) - (Number(a.balance) || 0);
    if (balanceDifference !== 0) return balanceDifference;
    return a.symbol.localeCompare(b.symbol);
  });

  return ranked.slice(0, boundedLimit);
}
