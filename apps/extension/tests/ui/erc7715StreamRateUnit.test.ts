import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStreamRateInput,
  parseStreamRateInput,
  streamRateRoundingNotice,
} from "../../src/components/Erc7715PermissionConfirmation/streamRateUnit";

test("stream rates switch between per-second and per-day display units", () => {
  assert.equal(formatStreamRateInput(1n, 6, "second"), "0.000001");
  assert.equal(formatStreamRateInput(1n, 6, "day"), "0.0864");
});

test("daily stream entries round down without increasing authority", () => {
  const parsed = parseStreamRateInput("2", 6, "day");

  assert.equal(parsed.amountPerSecond, 23n);
  assert.equal(parsed.effectiveAmountInUnit, 1_987_200n);
  assert.equal(parsed.requestedAmountInUnit, 2_000_000n);
  assert.equal(parsed.roundedDown, true);
  assert.equal(
    streamRateRoundingNotice(parsed, 6, "USDC"),
    "Effective rate is 1.9872 USDC/day after rounding down to token precision.",
  );
});

test("exact daily rates stay quiet and visible rounding is disclosed", () => {
  const exact = parseStreamRateInput("0.0864", 6, "day");
  assert.equal(exact.amountPerSecond, 1n);
  assert.equal(exact.roundedDown, false);
  assert.equal(streamRateRoundingNotice(exact, 6, "USDC"), null);

  const highPrecision = parseStreamRateInput("2", 18, "day");
  assert.equal(
    streamRateRoundingNotice(highPrecision, 18, "ETH"),
    "Effective rate is 1.999999 ETH/day after rounding down to token precision.",
  );
});

test("daily rates below one base unit per second are rejected", () => {
  assert.throws(
    () => parseStreamRateInput("0.000001", 6, "day"),
    /too small for this token's precision/u,
  );
});
