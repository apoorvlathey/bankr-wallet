import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNativeChange,
  formatAmount,
  normalizeRawNftsReceived,
} from "../../src/chrome/simulation/assetChangeNormalization";
import { getNativeCurrency } from "../../src/chrome/simulation/nativeCurrency";

test("asset amounts retain the established compact formatting", () => {
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(1.23456789), "1.234568");
  assert.equal(formatAmount(0.000123456789), "0.000123457");
  assert.equal(formatAmount(0.0000001), "<0.000001");
});

test("native changes normalize direction, raw values, and optional prices", () => {
  const native = getNativeCurrency(1);
  assert.equal(native.symbol, "ETH");

  assert.deepEqual(buildNativeChange(0n, native, 2_000), null);
  const outgoing = buildNativeChange(-1_000_000_000_000_000_000n, native, 2_000);
  assert.equal(outgoing?.direction, "out");
  assert.equal(outgoing?.rawDelta, "-1000000000000000000");
  assert.equal(outgoing?.formattedAmount, "1");
  assert.equal(outgoing?.valueUsd, 2_000);
});

test("decoded NFT tuples receive bounded numeric standards and empty URI defaults", () => {
  const [normalized] = normalizeRawNftsReceived([
    {
      token: "0x1111111111111111111111111111111111111111",
      tokenId: 7n,
      amount: 1n,
      standard: 1n,
    },
  ]);
  assert.deepEqual(normalized, {
    token: "0x1111111111111111111111111111111111111111",
    tokenId: 7n,
    amount: 1n,
    standard: 1,
    tokenUriRaw: "0x",
  });
});
