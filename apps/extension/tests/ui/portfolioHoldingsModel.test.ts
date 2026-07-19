import assert from "node:assert/strict";
import test from "node:test";
import type {
  DefiPosition,
  PortfolioToken,
} from "../../src/chrome/portfolio/api";
import {
  buildAssetDisplayRows,
  filterPortfolioTokens,
  getChainTotals,
  mergeTokenEnrichment,
} from "../../src/components/Portfolio/Holdings/transforms";
import {
  resolveUnifyPortfolioBalances,
} from "../../src/components/Portfolio/portfolioPreferences";
import { getProgressiveHoldingsRows } from "../../src/components/Portfolio/Holdings/progressiveRowsModel";

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

test("portfolio balance unification defaults on for missing or invalid storage", () => {
  assert.equal(resolveUnifyPortfolioBalances(undefined), true);
  assert.equal(resolveUnifyPortfolioBalances("false"), true);
  assert.equal(resolveUnifyPortfolioBalances(false), false);
});

test("portfolio rows can preserve individual cross-network balances", () => {
  const ethTokens = [
    token("ETH", 1, {
      contractAddress: "native",
      valueUsd: 10,
    }),
    token("ETH", 8453, {
      contractAddress: "native",
      valueUsd: 5,
    }),
  ];

  const unified = buildAssetDisplayRows(ethTokens, null);
  assert.equal(unified.primaryAssetRows.length, 1);
  assert.equal(unified.primaryAssetRows[0]?.kind, "aggregate");

  const individual = buildAssetDisplayRows(ethTokens, null, false);
  assert.equal(individual.primaryAssetRows.length, 2);
  assert.deepEqual(
    individual.primaryAssetRows.map((row) => row.kind),
    ["token", "token"],
  );
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

test("large holdings render one ordered page and defer later sections", () => {
  const primaryRows = Array.from({ length: 1_000 }, (_, index) => ({
    kind: "token" as const,
    token: token(`TOKEN${index}`, 1),
    valueUsd: 1_000 - index,
  }));
  const projection = getProgressiveHoldingsRows({
    primaryRows,
    lowValueRows: [],
    positions: [{ protocol: "Later" }] as DefiPosition[],
    includeLowValueRows: false,
    visibleCount: 24,
  });

  assert.equal(projection.visiblePrimaryRows.length, 24);
  assert.equal(projection.visiblePositions.length, 0);
  assert.equal(projection.remainingCount, 977);
  assert.equal(projection.hasMore, true);
});

test("collapsed low-value rows do not block progressively visible positions", () => {
  const primaryRows = [{
    kind: "token" as const,
    token: token("ETH", 1),
    valueUsd: 1,
  }];
  const lowValueRows = Array.from({ length: 50 }, (_, index) => ({
    kind: "token" as const,
    token: token(`LOW${index}`, 1),
    valueUsd: 0,
  }));
  const positions = [{ protocol: "Visible" }] as DefiPosition[];

  const projection = getProgressiveHoldingsRows({
    primaryRows,
    lowValueRows,
    positions,
    includeLowValueRows: false,
    visibleCount: 24,
  });
  assert.equal(projection.visibleLowValueRows.length, 0);
  assert.equal(projection.visiblePositions.length, 1);
  assert.equal(projection.hasMore, false);
});
