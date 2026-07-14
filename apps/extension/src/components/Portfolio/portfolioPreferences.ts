export const UNIFY_PORTFOLIO_BALANCES_STORAGE_KEY =
  "unifyPortfolioBalances" as const;

export function resolveUnifyPortfolioBalances(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}
