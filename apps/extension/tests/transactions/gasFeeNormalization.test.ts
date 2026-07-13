import assert from "node:assert/strict";
import test from "node:test";

import { convertLegacyGasPriceToEip1559 } from "../../src/chrome/gasFeeNormalization";

test("legacy gasPrice is treated as a total fee rather than duplicated as the priority fee", () => {
  assert.deepEqual(
    convertLegacyGasPriceToEip1559(82_278_000n, 54_802_000n),
    {
      maxFeePerGas: 82_278_000n,
      maxPriorityFeePerGas: 27_476_000n,
    },
  );
});

test("legacy gasPrice conversion never creates a negative priority fee", () => {
  assert.deepEqual(convertLegacyGasPriceToEip1559(50n, 75n), {
    maxFeePerGas: 50n,
    maxPriorityFeePerGas: 0n,
  });
});

test("zero-base-fee chains retain the full legacy gasPrice as priority", () => {
  assert.deepEqual(convertLegacyGasPriceToEip1559(50n, 0n), {
    maxFeePerGas: 50n,
    maxPriorityFeePerGas: 50n,
  });
});
