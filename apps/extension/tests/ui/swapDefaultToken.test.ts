import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioToken } from "../../src/chrome/portfolio/api";
import { pickDefaultSwapSellToken } from "../../src/components/Swap/swapViewUtils";

const token = (
  symbol: string,
  chainId: number,
  valueUsd: number,
  balance = "1",
): PortfolioToken => ({
  symbol,
  name: symbol,
  contractAddress: symbol === "ETH" ? "native" : `0x${symbol.padEnd(40, "0")}`,
  chainId,
  decimals: 18,
  balance,
  balanceFormatted: balance,
  priceUsd: valueUsd,
  valueUsd,
});

test("cached swap default chooses the highest-value funded supported token", () => {
  const selected = pickDefaultSwapSellToken([
    token("ETH", 1, 20),
    token("USDC", 8453, 75),
    token("NOPE", 999_999, 500),
    token("ZERO", 8453, 0, "0"),
  ]);

  assert.equal(selected?.symbol, "USDC");
  assert.equal(pickDefaultSwapSellToken([token("ZERO", 8453, 0, "0")]), null);
});

test("cached swap default can be constrained to a newly selected network", () => {
  const selected = pickDefaultSwapSellToken(
    [token("ETH", 1, 20), token("USDC", 8453, 75)],
    1,
  );

  assert.equal(selected?.symbol, "ETH");
});
