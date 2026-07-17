import assert from "node:assert/strict";
import test from "node:test";
import { formatEthExact, formatEthFee } from "../../src/lib/gasFormatUtils";

test("gas fee formatting preserves tiny non-zero wei values", () => {
  assert.equal(formatEthFee("1"), "0.000000000000000001 ETH");
  assert.equal(formatEthExact("1"), "0.000000000000000001 ETH");
});

test("gas fee display keeps meaningful precision while tooltip remains exact", () => {
  assert.equal(formatEthFee("11549450000000"), "0.0000115 ETH");
  assert.equal(formatEthExact("11549450000000"), "0.00001154945 ETH");
});
