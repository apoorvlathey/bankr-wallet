import assert from "node:assert/strict";
import test from "node:test";
import { getSmartExpandedCalls } from "../../src/components/BatchConfirmation/useBatchReviewState";

test("smart batch call expansion opens only single-call requests", () => {
  assert.deepEqual([...getSmartExpandedCalls(0)], []);
  assert.deepEqual([...getSmartExpandedCalls(1)], [0]);
  assert.deepEqual([...getSmartExpandedCalls(2)], []);
  assert.deepEqual([...getSmartExpandedCalls(100)], []);
});
