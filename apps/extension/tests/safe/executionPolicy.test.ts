import assert from "node:assert/strict";
import test from "node:test";
import { hasUnresolvedSafeExecution } from "../../src/chrome/safe/executionPolicy";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";

function evidence(
  overrides: Partial<Pick<
    SafeProposalRecord,
    "state" | "transactionHash" | "serializedExecution" | "effectClaim"
  >> = {},
) {
  return {
    state: "readyToExecute" as const,
    ...overrides,
  };
}

test("durable Safe execution evidence blocks every duplicate submit path", () => {
  assert.equal(hasUnresolvedSafeExecution(evidence()), false);
  assert.equal(hasUnresolvedSafeExecution(evidence({ state: "executing" })), true);
  assert.equal(hasUnresolvedSafeExecution(evidence({
    transactionHash: `0x${"11".repeat(32)}`,
  })), true);
  assert.equal(hasUnresolvedSafeExecution(evidence({
    serializedExecution: `0x${"22".repeat(64)}`,
  })), true);
  assert.equal(hasUnresolvedSafeExecution(evidence({
    effectClaim: {
      kind: "execute",
      claimId: "claim-1",
      claimedAt: 1,
    },
  })), true);
});
