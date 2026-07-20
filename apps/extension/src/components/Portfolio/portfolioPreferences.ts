export const UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY =
  "unifyPortfolioBalances" as const;
export const FOLLOW_DAPP_NETWORK_STORAGE_KEY = "followDappNetwork" as const;

export function resolveUnifyPortfolioBalances(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export function resolveFollowDappNetwork(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}
