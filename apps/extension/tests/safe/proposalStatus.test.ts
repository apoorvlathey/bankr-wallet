import assert from "node:assert/strict";
import test from "node:test";
import { isPendingSafeProposal } from "../../src/chrome/safe/proposalStatus";
import type { SafeProposalState } from "../../src/chrome/safe/types";

const unresolved: SafeProposalState[] = [
  "draft",
  "authorizing",
  "approvedLocally",
  "publishing",
  "awaitingApprovals",
  "readyToExecute",
  "executing",
  "ambiguous",
  "stale",
  "blocked",
];

const terminal: SafeProposalState[] = [
  "executed",
  "cancelled",
  "replaced",
  "failed",
];

test("all unresolved Safe request states contribute to pending counts", () => {
  for (const state of unresolved) {
    assert.equal(isPendingSafeProposal({ state }), true, state);
  }
});

test("terminal and hidden Safe requests do not contribute to pending counts", () => {
  for (const state of terminal) {
    assert.equal(isPendingSafeProposal({ state }), false, state);
  }
  assert.equal(isPendingSafeProposal({ state: "blocked", hiddenAt: 1 }), false);
});
