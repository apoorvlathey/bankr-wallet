import type { DefiPosition, PortfolioToken } from "./providers/types";

export const MAX_PORTFOLIO_RESPONSE_TOKENS = 1_000;
export const MAX_PORTFOLIO_RESPONSE_POSITIONS = 100;
export const MAX_PORTFOLIO_POSITION_ASSETS = 50;

export interface BoundedPortfolioResponse {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  tokenCount: number;
  omittedTokenCount: number;
  omittedTokenValueUsd: number;
  omittedTokenValueUsdByChain: Record<string, number>;
  truncated: boolean;
}

function finiteValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function boundPortfolioResponse(
  tokens: PortfolioToken[],
  defiPositions: DefiPosition[],
  maxTokens = MAX_PORTFOLIO_RESPONSE_TOKENS,
): BoundedPortfolioResponse {
  const rankedTokens = [...tokens].sort(
    (a, b) => finiteValue(b.valueUsd) - finiteValue(a.valueUsd),
  );
  const requestedLimit = Number.isFinite(maxTokens)
    ? maxTokens
    : MAX_PORTFOLIO_RESPONSE_TOKENS;
  const tokenLimit = Math.max(
    1,
    Math.min(MAX_PORTFOLIO_RESPONSE_TOKENS, Math.floor(requestedLimit)),
  );
  const visibleTokens = rankedTokens.slice(0, tokenLimit);
  const omittedTokens = rankedTokens.slice(tokenLimit);
  const omittedTokenValueUsdByChain: Record<string, number> = {};
  let omittedTokenValueUsd = 0;
  for (const token of omittedTokens) {
    const valueUsd = finiteValue(token.valueUsd);
    omittedTokenValueUsd += valueUsd;
    const chainKey = String(token.chainId);
    omittedTokenValueUsdByChain[chainKey] =
      (omittedTokenValueUsdByChain[chainKey] ?? 0) + valueUsd;
  }

  const visiblePositions = defiPositions
    .slice(0, MAX_PORTFOLIO_RESPONSE_POSITIONS)
    .map((position) => ({
      ...position,
      assets: position.assets.slice(0, MAX_PORTFOLIO_POSITION_ASSETS),
      rewardAssets: position.rewardAssets.slice(0, MAX_PORTFOLIO_POSITION_ASSETS),
    }));
  const truncatedPositions = visiblePositions.some(
    (position, index) =>
      position.assets.length !== defiPositions[index]?.assets.length ||
      position.rewardAssets.length !== defiPositions[index]?.rewardAssets.length,
  );

  return {
    tokens: visibleTokens,
    defiPositions: visiblePositions,
    tokenCount: rankedTokens.length,
    omittedTokenCount: omittedTokens.length,
    omittedTokenValueUsd,
    omittedTokenValueUsdByChain,
    truncated:
      omittedTokens.length > 0 ||
      defiPositions.length > visiblePositions.length ||
      truncatedPositions,
  };
}
