import type { PortfolioToken } from "@/chrome/portfolio/api";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";

interface PendingVisibleBalanceRefreshOptions {
  visibleTokens: PortfolioToken[];
  hiddenTokenKeys: ReadonlySet<string>;
  onchainFetchedTokenKeys: ReadonlySet<string>;
  attemptedTokenKeys: ReadonlySet<string>;
}

/**
 * Select visible balances that have not been verified or attempted during the
 * current portfolio refresh cycle. A failed RPC read must stay eligible for a
 * later explicit refresh without creating an immediate automatic retry loop.
 */
export function selectPendingVisibleBalanceRefreshTokens({
  visibleTokens,
  hiddenTokenKeys,
  onchainFetchedTokenKeys,
  attemptedTokenKeys,
}: PendingVisibleBalanceRefreshOptions): PortfolioToken[] {
  return visibleTokens.filter((token) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    return (
      !hiddenTokenKeys.has(key) &&
      !onchainFetchedTokenKeys.has(key) &&
      !attemptedTokenKeys.has(key)
    );
  });
}
