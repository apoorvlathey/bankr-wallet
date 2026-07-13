import assert from "node:assert/strict";
import test from "node:test";

import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import { buildPortfolioPriceMap } from "../../src/chrome/simulation/portfolioPrices";

function token(
  contractAddress: string,
  chainId: number,
  priceUsd: number,
): PortfolioToken {
  return {
    symbol: "TKN",
    name: "Token",
    contractAddress,
    chainId,
    decimals: 18,
    balance: "0",
    balanceFormatted: "0",
    priceUsd,
    valueUsd: 0,
  };
}

test("portfolio price maps use canonical native and lowercase contract keys", () => {
  const prices = buildPortfolioPriceMap([
    token("native", 1, 2_000),
    token("0x0000000000000000000000000000000000000000", 8453, 2_001),
    token("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD", 1, 1.25),
    token("0x1111111111111111111111111111111111111111", 1, 0),
    token("0x2222222222222222222222222222222222222222", 1, -1),
  ]);

  assert.equal(prices.get("1:native"), 2_000);
  assert.equal(prices.get("8453:native"), 2_001);
  assert.equal(
    prices.get("1:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
    1.25,
  );
  assert.equal(prices.size, 3);
});
