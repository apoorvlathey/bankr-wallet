import assert from "node:assert/strict";
import test from "node:test";

import { shouldHaltForceInclusionTail } from "../../src/chrome/forceInclusion/batch";
import { shouldRetainUnobservedBroadcast } from "../../src/chrome/forceInclusion/receiptPoller";

test("multi-deposit force inclusion halts its higher-nonce tail on uncertainty", () => {
  assert.equal(
    shouldHaltForceInclusionTail({ broadcastUncertain: true }),
    true,
  );
  assert.equal(shouldHaltForceInclusionTail({}), false);
});

test("receipt polling retains an unobserved ambiguous broadcast", () => {
  assert.equal(
    shouldRetainUnobservedBroadcast({ broadcastUncertain: true }),
    true,
  );
  assert.equal(
    shouldRetainUnobservedBroadcast({ broadcastUncertain: false }),
    false,
  );
  assert.equal(shouldRetainUnobservedBroadcast(undefined), false);
});
