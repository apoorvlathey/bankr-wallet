import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import { getPortfolioTokenKey } from "../../src/chrome/portfolio/hiddenTokens";
import {
  getPortfolioTokenBalance,
  mergeVerifiedTokenBalances,
  PORTFOLIO_DATA_PAGE_SIZE,
  selectInitialBalanceRefreshTokens,
} from "../../src/components/tokenHoldingsUtils";
import {
  CANONICAL_USDC_BY_CHAIN_ID,
  CANONICAL_USDT_BY_CHAIN_ID,
} from "../../src/constants/canonicalTokens";
import { CHAIN_REGISTRY } from "../../src/constants/chainRegistry";

function token(balance: string, balanceFormatted: string): PortfolioToken {
  return {
    symbol: "ETH",
    name: "Ether",
    contractAddress: "native",
    chainId: 1,
    decimals: 18,
    balance,
    balanceFormatted,
    priceUsd: 1,
    valueUsd: 1,
  };
}

test("uses the canonical decimal balance when display text is a threshold", () => {
  assert.equal(
    getPortfolioTokenBalance(token("0.00000042", "<0.000001")),
    0.00000042,
  );
});

test("does not parse locale-formatted display text", () => {
  assert.equal(
    getPortfolioTokenBalance(token("1234.5", "1,234.5")),
    1234.5,
  );
});

test("fails closed for malformed canonical balances", () => {
  assert.equal(getPortfolioTokenBalance(token("not-a-number", "12.34")), 0);
  assert.equal(getPortfolioTokenBalance(token("Infinity", "Infinity")), 0);
  assert.equal(getPortfolioTokenBalance(token("-1", "-1")), 0);
});

test("a verified zero balance prevents a stale API token from reappearing", () => {
  const staleEns = {
    ...token("10", "10"),
    symbol: "ENS",
    name: "Ethereum Name Service",
    contractAddress: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
    priceUsd: 20,
    valueUsd: 200,
  };
  const key = getPortfolioTokenKey(1, staleEns.contractAddress);
  const verifiedZero = {
    ...staleEns,
    balance: "0",
    balanceFormatted: "0",
    valueUsd: 0,
  };

  assert.deepEqual(
    mergeVerifiedTokenBalances(
      [staleEns],
      [verifiedZero],
      new Set([key]),
    ),
    [],
  );
});

test("a persisted verified key without a row acts as a zero tombstone", () => {
  const staleEns = {
    ...token("10", "10"),
    contractAddress: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
  };
  const key = getPortfolioTokenKey(1, staleEns.contractAddress);

  assert.deepEqual(
    mergeVerifiedTokenBalances([staleEns], [], new Set([key])),
    [],
  );
});

test("verified balances keep fresh API metadata and prices", () => {
  const apiToken = {
    ...token("10", "10"),
    symbol: "ENS",
    name: "Ethereum Name Service",
    contractAddress: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
    priceUsd: 25,
    valueUsd: 250,
  };
  const verifiedToken = {
    ...apiToken,
    balance: "2",
    balanceFormatted: "2",
    priceUsd: 20,
    valueUsd: 40,
  };
  const key = getPortfolioTokenKey(1, apiToken.contractAddress);

  assert.deepEqual(
    mergeVerifiedTokenBalances(
      [apiToken],
      [verifiedToken],
      new Set([key]),
    ),
    [{ ...apiToken, balance: "2", balanceFormatted: "2", valueUsd: 50 }],
  );
});

test("large portfolios bound initial RPC verification to one data page", () => {
  const tokens = Array.from({ length: 1_000 }, (_, index) => ({
    ...token("1", "1"),
    symbol: `TOKEN${index}`,
    contractAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    valueUsd: 1_000 - index,
  }));

  const selected = selectInitialBalanceRefreshTokens(tokens, new Set(), false);
  assert.equal(selected.length, PORTFOLIO_DATA_PAGE_SIZE);
  assert.deepEqual(selected, tokens.slice(0, PORTFOLIO_DATA_PAGE_SIZE));
});

test("explicit token refreshes lead the bounded initial RPC page", () => {
  const tokens = Array.from({ length: 40 }, (_, index) => ({
    ...token("1", "1"),
    symbol: `TOKEN${index}`,
    contractAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    valueUsd: 40 - index,
  }));
  const priority = tokens.at(-1)!;
  const priorityKey = getPortfolioTokenKey(
    priority.chainId,
    priority.contractAddress,
  );

  const selected = selectInitialBalanceRefreshTokens(
    tokens,
    new Set([priorityKey]),
    false,
  );
  assert.equal(selected.length, PORTFOLIO_DATA_PAGE_SIZE);
  assert.equal(selected[0], priority);
});

test("new Zerion-backed ETH mainnets participate in ETH aggregation", () => {
  const ethChainIds = new Set(
    CHAIN_REGISTRY.filter(
      (chain) => chain.nativeCurrency.symbol === "ETH",
    ).map((chain) => chain.chainId),
  );

  for (const chainId of [2741, 81457, 57073, 59144, 34443, 480, 324, 534352]) {
    assert.equal(ethChainIds.has(chainId), true, `missing ETH chain ${chainId}`);
  }
});

test("canonical USDC aggregation includes verified new-chain contracts", () => {
  const expected = new Map([
    [143, "0x754704bc059f8c67012fed69bc8a327a5aafb603"],
    [146, "0x29219dd400f2bf60e5a23d13be72b486d4038894"],
    [324, "0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4"],
    [480, "0x79a02482a880bce3f13e09da970dc34db4cd24d1"],
    [999, "0xb88339cb7199b77e23db6e890353e22632ba630f"],
    [2741, "0x84a71ccd554cc1b02749b35d22f684cc8ec987e1"],
    [5000, "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9"],
    [34443, "0xd988097fb8612cc24eec14542bc03424c656005f"],
    [43114, "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"],
    [57073, "0x2d270e6886d130d724215a266106e6832161eaed"],
    [59144, "0x176211869ca2b568f2a7d4ee941e073a821ee1ff"],
    [80094, "0x549943e04f40284185054145c6e4e9568c1d3241"],
    [534352, "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4"],
  ]);

  for (const [chainId, address] of expected) {
    assert.equal(CANONICAL_USDC_BY_CHAIN_ID.get(chainId), address);
  }
});

test("canonical USDT aggregation includes verified new-chain contracts", () => {
  const expected = new Map([
    [143, "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
    [324, "0x493257fd37edb34451f62edf8d2a0c418852ba4c"],
    [999, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"],
    [4217, "0x20c00000000000000000000014f22ca97301eb73"],
    [5000, "0x779ded0c9e1022225f8e0630b35a9b54be713736"],
    [9745, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"],
    [43114, "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7"],
    [57073, "0x0200c29006150606b650577bbe7b6248f58470c1"],
    [80094, "0x779ded0c9e1022225f8e0630b35a9b54be713736"],
  ]);

  for (const [chainId, address] of expected) {
    assert.equal(CANONICAL_USDT_BY_CHAIN_ID.get(chainId), address);
  }
});
