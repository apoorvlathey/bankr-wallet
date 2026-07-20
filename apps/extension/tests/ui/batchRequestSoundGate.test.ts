import assert from "node:assert/strict";
import test from "node:test";
import { createBatchRequestSoundGate } from "../../src/sounds/batchRequestSoundGate";

test("one logical batch request claims the arrival sound only once", () => {
  const gate = createBatchRequestSoundGate();

  assert.equal(gate.claim("batch-a"), true);
  assert.equal(gate.claim("batch-a"), false, "the ready update must stay silent");
  assert.equal(gate.claim("batch-b"), true, "a separate batch still gets a cue");
});
