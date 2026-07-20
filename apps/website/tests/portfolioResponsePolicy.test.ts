import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PORTFOLIO_POSITION_ASSETS,
  MAX_PORTFOLIO_RESPONSE_POSITIONS,
  MAX_PORTFOLIO_RESPONSE_TOKENS,
  boundPortfolioResponse,
} from "../app/api/portfolio/responsePolicy";

function token(index: number) {
  return {
    symbol: `T${index}`,
    name: `Token ${index}`,
    contractAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    chainId: index % 2 === 0 ? 8453 : 1,
    decimals: 18,
    balance: "0.000000000000000001",
    balanceFormatted: "<0.000001",
    priceUsd: 0,
    valueUsd: index < 1_100 ? 1_100 - index : 0,
  };
}

test("portfolio API bounds wallet tokens and DeFi collections", () => {
  const tokens = Array.from({ length: 12_266 }, (_, index) => token(index));
  const assets = Array.from({ length: 80 }, (_, index) => ({
    ...token(index),
  }));
  const positions = Array.from({ length: 120 }, (_, index) => ({
    protocol: `Protocol ${index}`,
    chainId: 8453,
    type: "deposit",
    name: "Position",
    valueUsd: 1,
    assets,
    rewardAssets: assets,
  }));

  const result = boundPortfolioResponse(tokens, positions);

  assert.equal(result.tokens.length, MAX_PORTFOLIO_RESPONSE_TOKENS);
  assert.equal(result.defiPositions.length, MAX_PORTFOLIO_RESPONSE_POSITIONS);
  assert.equal(
    result.defiPositions[0]?.assets.length,
    MAX_PORTFOLIO_POSITION_ASSETS,
  );
  assert.equal(result.tokenCount, 12_266);
  assert.equal(result.omittedTokenCount, 11_266);
  assert.ok(result.omittedTokenValueUsd > 0);
  assert.ok(result.omittedTokenValueUsdByChain["1"] > 0);
  assert.equal(result.truncated, true);
});

test("portfolio API supports smaller internal consumer projections", () => {
  const tokens = Array.from({ length: 20 }, (_, index) => token(index));
  const result = boundPortfolioResponse(tokens, [], 5);
  assert.equal(result.tokens.length, 5);
  assert.equal(result.tokenCount, 20);
  assert.equal(result.omittedTokenCount, 15);
  assert.equal(result.tokens[0].valueUsd, 1_100);
});
