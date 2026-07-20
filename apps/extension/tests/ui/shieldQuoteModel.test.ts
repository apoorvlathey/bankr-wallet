import assert from "node:assert/strict";
import test from "node:test";

import {
  convertShieldAmountInputMode,
  formatShieldAmountConversion,
  formatShieldAmountInput,
  formatShieldUsdValue,
  formatShieldWei,
  parseShieldAmountInputWei,
  parseShieldQuoteResponse,
  shieldAmountInputInEth,
  shieldMaximumInput,
  validateShieldAmountInput,
} from "../../src/components/Shield/model/shieldQuote";

function response() {
  return {
    success: true,
    quote: {
      chainId: 11_155_111,
      amountWei: "101010101010101010",
      balanceWei: "500000000000000000",
      minimumAmountWei: "1000000000000000",
      protocolFeeWei: "1010101010101010",
      shieldedAmountWei: "100000000000000000",
      gasReserveWei: "200000000000000",
      totalRequiredWei: "101210101010101010",
      maxShieldableWei: "494802000000000000",
      vettingFeeBPS: "100",
      canAfford: true,
    },
  };
}

test("Shield amount input rejects ambiguous, sub-minimum, and uint256-overflow values", () => {
  assert.equal(validateShieldAmountInput("0.001").status, "valid");
  assert.equal(validateShieldAmountInput("0.0009").status, "below-minimum");
  assert.equal(validateShieldAmountInput("1.1").status, "valid");
  for (const amount of [".1", "01", "1e-3", "0.0010000000000000001"]) {
    assert.equal(validateShieldAmountInput(amount).status, "invalid", amount);
  }
  assert.equal(
    validateShieldAmountInput(
      "115792089237316195423570985008687907853269984665640564039457.584007913129639936",
    ).status,
    "invalid",
  );
});

test("Shield slider parsing retains amounts below the policy minimum", () => {
  assert.equal(
    parseShieldAmountInputWei("0.0009"),
    900_000_000_000_000n,
  );
  assert.equal(parseShieldAmountInputWei(".0009"), null);
  assert.equal(
    parseShieldAmountInputWei(
      "115792089237316195423570985008687907853269984665640564039457.584007913129639936",
    ),
    null,
  );
});

test("Shield quote parser verifies exact shape and arithmetic", () => {
  const parsed = parseShieldQuoteResponse(
    response(),
    100_000_000_000_000_000n,
  );
  assert.ok(parsed);
  assert.equal(parsed.protocolFeeWei, 1_010_101_010_101_010n);
  assert.equal(parsed.shieldedAmountWei, 100_000_000_000_000_000n);
  assert.equal(shieldMaximumInput(parsed), "0.494802");

  const extra = response() as any;
  extra.quote.debug = "not accepted";
  assert.equal(
    parseShieldQuoteResponse(extra, 100_000_000_000_000_000n),
    null,
  );

  const inconsistent = response();
  inconsistent.quote.totalRequiredWei = "100000000000000000";
  assert.equal(
    parseShieldQuoteResponse(inconsistent, 100_000_000_000_000_000n),
    null,
  );
});

test("Shield quote formatting marks approximations instead of silently rounding", () => {
  assert.equal(formatShieldWei(1_000_000_000_000_000n), "0.001");
  assert.equal(formatShieldWei(12_345_678_912_345_678n), "~0.01234567");
  assert.equal(formatShieldWei(1n), "<0.00000001");
});

test("Shield balance USD formatting handles zero, current prices, and unavailable prices", () => {
  assert.equal(formatShieldUsdValue(0n, null), "$0.00");
  assert.equal(
    formatShieldUsdValue(4_950_000_000_000_000n, 3_600),
    "$17.82",
  );
  assert.equal(formatShieldUsdValue(1_000_000_000_000_000n, null), null);
  assert.equal(formatShieldUsdValue(1_000_000_000_000_000n, 0), null);
});

test("Shield amount entry converts between ETH and USD without changing the intended value", () => {
  assert.equal(convertShieldAmountInputMode("0.01", false, 3_600), "36.00");
  assert.equal(convertShieldAmountInputMode("36.00", true, 3_600), "0.01");
  assert.equal(shieldAmountInputInEth("36.00", true, 3_600), "0.01");
  assert.equal(formatShieldAmountInput(10_000_000_000_000_000n, true, 3_600), "36.00");
  assert.equal(formatShieldAmountConversion("0.01", false, 3_600), "$36.00");
  assert.equal(formatShieldAmountConversion("36.00", true, 3_600), "0.01 ETH");
});

test("Shield USD entry fails closed when a current ETH price is unavailable", () => {
  assert.equal(shieldAmountInputInEth("36.00", true, null), "");
  assert.equal(formatShieldAmountConversion("0.01", false, null), null);
  assert.equal(convertShieldAmountInputMode("0.01", false, null), "0.01");
});
