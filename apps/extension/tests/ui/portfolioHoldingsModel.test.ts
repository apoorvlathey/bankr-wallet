import assert from "node:assert/strict";
import test from "node:test";
import type {
  DefiPosition,
  PortfolioToken,
} from "../../src/chrome/portfolio/api";
import {
  filterPortfolioTokens,
  getChainTotals,
  mergeTokenEnrichment,
} from "../../src/components/Portfolio/Holdings/transforms";

const token = (
  symbol: string,
  chainId: number,
  overrides: Partial<PortfolioToken> = {},
): PortfolioToken =>
  ({
    symbol,
    name: symbol,
    chainId,
    contractAddress: `0x${chainId.toString(16).padStart(40, "0")}`,
    decimals: 18,
    balance: "1",
    balanceFormatted: "1",
    priceUsd: 1,
    valueUsd: 1,
    ...overrides,
  }) as PortfolioToken;

test("portfolio filtering composes chain and case-insensitive search", () => {
  const tokens = [
    token("ETH", 1, { name: "Ether" }),
    token("USDC", 8453, { name: "USD Coin" }),
  ];

  assert.deepEqual(
    filterPortfolioTokens(tokens, 8453, "coin").map((item) => item.symbol),
    ["USDC"],
  );
  assert.deepEqual(filterPortfolioTokens(tokens, 1, "usd"), []);
});

test("metadata enrichment retains authoritative balance while updating price", () => {
  const current = token("NEW", 8453, {
    name: "",
    balance: "2",
    balanceFormatted: "2",
    priceUsd: 0,
    valueUsd: 0,
  });
  const enriched = token("NEW", 8453, {
    name: "New Token",
    balance: "999",
    balanceFormatted: "999",
    priceUsd: 3,
    valueUsd: 2_997,
  });

  const [merged] = mergeTokenEnrichment([current], [enriched]);
  assert.equal(merged?.balance, "2");
  assert.equal(merged?.name, "New Token");
  assert.equal(merged?.priceUsd, 3);
  assert.equal(merged?.valueUsd, 6);
});

test("chain totals include positive token and DeFi values without negatives", () => {
  const totals = getChainTotals(
    [token("ETH", 1, { valueUsd: 10 }), token("BAD", 1, { valueUsd: -5 })],
    [
      { chainId: 1, valueUsd: 7 },
      { chainId: 8453, valueUsd: 3 },
    ] as DefiPosition[],
  );

  assert.equal(totals.get(1), 17);
  assert.equal(totals.get(8453), 3);
});
