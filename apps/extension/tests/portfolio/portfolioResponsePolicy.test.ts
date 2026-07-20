import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_REMOTE_PORTFOLIO_TOKENS,
  decodePortfolioResponse,
} from "../../src/chrome/portfolio/responsePolicy";

function token(index: number) {
  const valueUsd = index < 1_200 ? (1_200 - index) / 100 : 0;
  return {
    symbol: `T${index}`,
    name: `Portfolio token ${index}`,
    contractAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    chainId: 8453,
    decimals: 18,
    balance: index === 0 ? "1" : "0.000000000000000001",
    balanceFormatted: index === 0 ? "1" : "<0.000001",
    priceUsd: valueUsd,
    valueUsd,
    logoUrl: "https://images.example/token.png",
  };
}

test("Jesse-sized portfolios are reduced before entering application state", () => {
  const tokens = Array.from({ length: 12_266 }, (_, index) => token(index));
  tokens[tokens.length - 1] = {
    ...tokens[tokens.length - 1],
    symbol: "ETH",
    name: "Ether",
    contractAddress: "native",
  };

  const portfolio = decodePortfolioResponse({
    tokens,
    defiPositions: [],
    totalValueUsd: tokens.reduce((sum, entry) => sum + entry.valueUsd, 0),
  });

  assert.equal(portfolio.tokens.length, MAX_REMOTE_PORTFOLIO_TOKENS);
  assert.equal(portfolio.tokenCount, 12_266);
  assert.equal(portfolio.omittedTokenCount, 11_266);
  assert.equal(portfolio.truncated, true);
  assert.ok(portfolio.omittedTokenValueUsd > 0);
  assert.ok(portfolio.tokens.some((entry) => entry.contractAddress === "native"));
  assert.ok(
    new TextEncoder().encode(JSON.stringify(portfolio)).byteLength < 400_000,
  );
});

test("server truncation metadata preserves omitted value and chain totals", () => {
  const portfolio = decodePortfolioResponse({
    tokens: Array.from({ length: 1_000 }, (_, index) => token(index)),
    defiPositions: [],
    totalValueUsd: 50_000,
    tokenCount: 12_266,
    omittedTokenCount: 11_266,
    omittedTokenValueUsd: 23.5,
    omittedTokenValueUsdByChain: { "8453": 23.5 },
    truncated: true,
  });

  assert.equal(portfolio.omittedTokenCount, 11_266);
  assert.equal(portfolio.omittedTokenValueUsd, 23.5);
  assert.deepEqual(portfolio.omittedTokenValueUsdByChain, { "8453": 23.5 });
});

test("unreasonably large candidate arrays fail closed", () => {
  const repeated = token(0);
  assert.throws(
    () =>
      decodePortfolioResponse({
        tokens: Array.from({ length: 20_001 }, () => repeated),
        defiPositions: [],
        totalValueUsd: 1,
      }),
    /invalid response/i,
  );
});
