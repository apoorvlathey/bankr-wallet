import assert from "node:assert/strict";
import test from "node:test";
import { formatUnits } from "viem";

import {
  createPrivacyShieldQuoteValues,
  grossPrivacyShieldAmount,
  parsePrivacyShieldAmount,
  PrivacyShieldQuoteError,
} from "../../src/chrome/privacy/deposit/quotePolicy";
import {
  privacyShieldGrossAmountForAvailableWei,
  privacyShieldGrossAmountWei,
  privacyShieldNetAmountWei,
} from "../../src/lib/privacyShieldAmounts";

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

test("Shield gross-up adds the fee while preserving the chosen shielded amount", () => {
  assert.equal(
    privacyShieldGrossAmountWei(10_000_000_000_000_000n, 50n),
    10_050_251_256_281_407n,
  );
  assert.equal(
    grossPrivacyShieldAmount(100_000_000_000_000_000n),
    101_010_101_010_101_010n,
  );

  const quote = createPrivacyShieldQuoteValues({
    shieldedAmountWei: 100_000_000_000_000_000n,
    balanceWei: 500_000_000_000_000_000n,
    gasLimit: 100_000n,
    maxFeePerGas: 2_000_000_000n,
  });

  assert.equal(quote.amountWei, "101010101010101010");
  assert.equal(quote.protocolFeeWei, "1010101010101010");
  assert.equal(quote.shieldedAmountWei, "100000000000000000");
  assert.equal(quote.gasReserveWei, "200000000000000");
  assert.equal(quote.totalRequiredWei, "101210101010101010");
  assert.equal(quote.maxShieldableWei, "494802000000000000");
  assert.equal(quote.canAfford, true);
  assert.equal(quote.vettingFeeBPS, "100");
});

test("mainnet Max uses the exact available gross amount at a fee-rounding boundary", () => {
  const availableGrossAmountWei = 2_000_000_000_000_199n;
  const shieldedAmountWei = privacyShieldNetAmountWei(
    availableGrossAmountWei,
    50n,
  );

  assert.equal(
    privacyShieldGrossAmountWei(shieldedAmountWei, 50n),
    availableGrossAmountWei + 1n,
  );
  assert.equal(
    privacyShieldGrossAmountForAvailableWei(
      shieldedAmountWei,
      50n,
      availableGrossAmountWei,
    ),
    availableGrossAmountWei,
  );
});

test("Shield quote Max follows balance after gas without an arbitrary cap", () => {
  const quote = createPrivacyShieldQuoteValues({
    shieldedAmountWei: 1_000_000_000_000_000n,
    balanceWei: 5_000_000_000_000_000_000n,
    gasLimit: 100_000n,
    maxFeePerGas: 1_000_000_000n,
  });
  assert.equal(quote.maxShieldableWei, "4949901000000000000");

  const maximumQuote = createPrivacyShieldQuoteValues({
    shieldedAmountWei: BigInt(quote.maxShieldableWei),
    balanceWei: 5_000_000_000_000_000_000n,
    gasLimit: 100_000n,
    maxFeePerGas: 1_000_000_000n,
  });
  assert.equal(maximumQuote.amountWei, "4999900000000000000");
  assert.equal(maximumQuote.totalRequiredWei, maximumQuote.balanceWei);

  const roundingBoundaryGross = 2_000_000_000_000_099n;
  const roundingBoundaryQuote = createPrivacyShieldQuoteValues({
    shieldedAmountWei: privacyShieldNetAmountWei(
      roundingBoundaryGross,
      100n,
    ),
    balanceWei: roundingBoundaryGross + 1n,
    gasLimit: 1n,
    maxFeePerGas: 1n,
  });
  assert.equal(
    roundingBoundaryQuote.amountWei,
    roundingBoundaryGross.toString(),
  );
  assert.equal(
    roundingBoundaryQuote.totalRequiredWei,
    roundingBoundaryQuote.balanceWei,
  );
});
