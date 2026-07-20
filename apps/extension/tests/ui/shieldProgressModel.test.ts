import assert from "node:assert/strict";
import test from "node:test";

import type { ShieldPendingOperation } from "../../src/components/Shield/model/shieldOperation";
import {
  getShieldOperationProgress,
  SHIELD_PROGRESS_STEPS,
} from "../../src/components/Shield/model/shieldProgress";

test("Shield progress follows the real four-stage deposit lifecycle", () => {
  assert.equal(SHIELD_PROGRESS_STEPS, 4);
  assert.deepEqual(getShieldOperationProgress("awaiting_wallet_confirmation"), {
    step: 1,
    completedSteps: 0,
    label: "Wallet confirmation",
    description: "Approve the Shield transaction in WalletChan before anything is sent.",
    complete: false,
  });
  assert.deepEqual(getShieldOperationProgress("submitted"), {
    step: 2,
    completedSteps: 1,
    label: "Sepolia confirmation",
    description: "WalletChan is checking submission and waiting for confirmation on Sepolia.",
    complete: false,
  });
  assert.deepEqual(getShieldOperationProgress("awaiting_event"), {
    step: 3,
    completedSteps: 2,
    label: "Deposit indexing",
    description: "The transaction is confirmed. WalletChan is locating and verifying its deposit event.",
    complete: false,
  });
  assert.deepEqual(getShieldOperationProgress("awaiting_asp"), {
    step: 4,
    completedSteps: 3,
    label: "Eligibility review",
    description: "Your deposit is confirmed and being checked before it becomes available to Unshield.",
    complete: false,
  });
  assert.deepEqual(getShieldOperationProgress("private_ready"), {
    step: 4,
    completedSteps: 4,
    label: "Ready",
    description: "Your private balance is ready to Unshield.",
    complete: true,
  });
});

test("failed and attention states do not imply forward progress", () => {
  const terminalStates: ShieldPendingOperation["state"][] = [
    "wallet_rejected",
    "submission_failed",
    "public_reverted",
    "asp_declined",
    "asp_removed",
    "ragequit_available",
    "ragequit_recovered",
    "failed_recoverable",
    "failed_needs_support",
  ];
  for (const state of terminalStates) {
    assert.equal(getShieldOperationProgress(state), null, state);
  }
});
