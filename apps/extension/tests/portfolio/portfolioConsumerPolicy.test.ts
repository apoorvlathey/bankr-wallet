import assert from "node:assert/strict";
import test from "node:test";

import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import {
  INTERACTIVE_PORTFOLIO_TOKEN_LIMIT,
  selectPortfolioTokensForInteraction,
} from "../../src/chrome/portfolio/consumerPolicy";

function token(index: number, overrides: Partial<PortfolioToken> = {}): PortfolioToken {
  return {
    symbol: `T${index}`,
    name: `Token ${index}`,
    contractAddress: `0x${index.toString(16).padStart(40, "0")}`,
    chainId: 8453,
    decimals: 18,
    balance: "1",
    balanceFormatted: "1",
    priceUsd: 1,
    valueUsd: index,
    ...overrides,
  };
}

test("interactive portfolio projections cap rows while pinning required assets", () => {
  const tokens = Array.from({ length: 1_500 }, (_, index) => token(index + 1));
  const selected = tokens[0];
  const native = token(2_000, {
    contractAddress: "native",
    chainId: 1,
    valueUsd: 0,
  });
  const result = selectPortfolioTokensForInteraction(
    [...tokens, native, tokens[0]],
    new Set([`${selected.chainId}-${selected.contractAddress.toLowerCase()}`]),
  );

  assert.equal(result.length, INTERACTIVE_PORTFOLIO_TOKEN_LIMIT);
  assert.ok(result.includes(selected));
  assert.ok(result.includes(native));
  assert.equal(new Set(result.map((item) => `${item.chainId}:${item.contractAddress}`)).size, result.length);
});
