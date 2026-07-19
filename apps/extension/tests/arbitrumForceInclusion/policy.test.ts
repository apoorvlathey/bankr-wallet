import assert from "node:assert/strict";
import test from "node:test";
import { isArbitrumForceEligible } from "../../src/chrome/arbitrumForceInclusion/policy";

test("force eligibility uses a strict block deadline", () => {
  const shared = {
    deadlineBlock: 100n,
    totalDelayedMessagesRead: 4n,
    messageIndex: 4n,
  };
  assert.equal(isArbitrumForceEligible({ ...shared, currentBlock: 100n }), false);
  assert.equal(isArbitrumForceEligible({ ...shared, currentBlock: 101n }), true);
});
test("an already-consumed delayed message is never force eligible", () => {
  assert.equal(
    isArbitrumForceEligible({
      currentBlock: 101n,
      deadlineBlock: 100n,
      totalDelayedMessagesRead: 5n,
      messageIndex: 4n,
    }),
    false,
  );
});
