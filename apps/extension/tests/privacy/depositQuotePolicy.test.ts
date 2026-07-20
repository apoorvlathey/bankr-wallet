import assert from "node:assert/strict";
import test from "node:test";
import { formatUnits } from "viem";

import {
  createPrivacyShieldQuoteValues,
  parsePrivacyShieldAmount,
  PrivacyShieldQuoteError,
} from "../../src/chrome/privacy/deposit/quotePolicy";

const MAX_UINT256 = (1n << 256n) - 1n;

test("Shield amount parsing is exact, minimum-bound, and uint256-safe", () => {
  assert.equal(parsePrivacyShieldAmount("0.001"), 1_000_000_000_000_000n);
  assert.equal(parsePrivacyShieldAmount("1"), 1_000_000_000_000_000_000n);
  assert.equal(
    parsePrivacyShieldAmount("1.000000000000000001"),
    1_000_000_000_000_000_001n,
  );
  assert.equal(
    parsePrivacyShieldAmount(formatUnits(MAX_UINT256, 18)),
    MAX_UINT256,
  );

  for (const amount of [
    "",
    " 0.001",
    ".001",
    "01",
    "1.",
    "1e-3",
    "0.0009",
    formatUnits(MAX_UINT256 + 1n, 18),
  ]) {
    assert.throws(
      () => parsePrivacyShieldAmount(amount),
      PrivacyShieldQuoteError,
      amount,
    );
  }
});

test("Shield quote applies the onchain fee and a gas-aware maximum", () => {
  const quote = createPrivacyShieldQuoteValues({
    amountWei: 100_000_000_000_000_000n,
    balanceWei: 500_000_000_000_000_000n,
    gasLimit: 100_000n,
    maxFeePerGas: 2_000_000_000n,
  });

  assert.equal(quote.protocolFeeWei, "1000000000000000");
  assert.equal(quote.shieldedAmountWei, "99000000000000000");
  assert.equal(quote.gasReserveWei, "200000000000000");
  assert.equal(quote.totalRequiredWei, "100200000000000000");
  assert.equal(quote.maxShieldableWei, "499800000000000000");
  assert.equal(quote.canAfford, true);
  assert.equal(quote.vettingFeeBPS, "100");
});

test("Shield quote Max follows balance after gas without an arbitrary cap", () => {
  const quote = createPrivacyShieldQuoteValues({
    amountWei: 1_000_000_000_000_000n,
    balanceWei: 5_000_000_000_000_000_000n,
    gasLimit: 100_000n,
    maxFeePerGas: 1_000_000_000n,
  });
  assert.equal(quote.maxShieldableWei, "4999900000000000000");
});
