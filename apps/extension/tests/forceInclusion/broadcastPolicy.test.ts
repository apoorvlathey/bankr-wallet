import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RECEIPT_POLL_DURATION_MS,
  FORCE_INCLUSION_L2_POLL_DURATION_MS,
  getReceiptPollingWindowMs,
  isForceInclusionL2Hash,
  shouldRetainUnobservedBroadcast,
} from "../../src/chrome/forceInclusion/broadcastPolicy";

const L1_HASH = `0x${"1".repeat(64)}`;
const L2_HASH = `0x${"2".repeat(64)}`;

for (const accountType of ["bankr", "privateKey", "seedPhrase"] as const) {
  test(`${accountType} force-inclusion L2 waits for derivation instead of declaring a mempool drop`, () => {
    const tx = {
      accountType,
      forceInclusionMeta: { l1TxHash: L1_HASH },
    };

    assert.equal(isForceInclusionL2Hash(tx, L2_HASH), true);
    assert.equal(shouldRetainUnobservedBroadcast(tx, L2_HASH), true);
    assert.equal(
      getReceiptPollingWindowMs(tx, L2_HASH),
      FORCE_INCLUSION_L2_POLL_DURATION_MS,
    );
  });
}

test("ordinary and L1 broadcasts retain the existing ten-minute polling window", () => {
  const forceInclusion = { forceInclusionMeta: { l1TxHash: L1_HASH } };
  assert.equal(isForceInclusionL2Hash(forceInclusion, L1_HASH), false);
  assert.equal(shouldRetainUnobservedBroadcast(forceInclusion, L1_HASH), false);
  assert.equal(
    getReceiptPollingWindowMs(forceInclusion, L1_HASH),
    DEFAULT_RECEIPT_POLL_DURATION_MS,
  );
  assert.equal(getReceiptPollingWindowMs(undefined, L2_HASH), 10 * 60 * 1000);
});
