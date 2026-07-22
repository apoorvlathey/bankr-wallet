import assert from "node:assert/strict";
import test from "node:test";

import type { ShieldPendingOperation } from "../../src/components/Shield/model/shieldOperation";
import {
  getShieldOperationProgress,
  SHIELD_PROGRESS_STEPS,
} from "../../src/components/Shield/model/shieldProgress";
import {
  formatShieldComplianceElapsedTime,
  getPrivacyShieldActivityState,
  getShieldComplianceProgressPercent,
  getShieldOperationProgress as getShieldOperationProgressForNetwork,
  isPrivacyShieldPublicRecoveryAvailable,
  SHIELD_COMPLIANCE_ESTIMATE_MS,
  SHIELD_COMPLIANCE_PENDING_CAP_PERCENT,
} from "../../src/lib/privacyShieldLifecycle";

test("Shield compliance elapsed time uses compact second, minute, and hour units", () => {
  const confirmedAt = 1_000;

  assert.equal(
    formatShieldComplianceElapsedTime(confirmedAt, confirmedAt + 50_000),
    "50sec",
  );
  assert.equal(
    formatShieldComplianceElapsedTime(confirmedAt, confirmedAt + 90_000),
    "1m 30s",
  );
  assert.equal(
    formatShieldComplianceElapsedTime(
      confirmedAt,
      confirmedAt + (60 + 25) * 60_000,
    ),
    "1hr 25min",
  );
  assert.equal(
    formatShieldComplianceElapsedTime(confirmedAt, confirmedAt - 1_000),
    "0sec",
  );
  assert.equal(formatShieldComplianceElapsedTime(undefined, confirmedAt), null);
});

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
    label: "Compliance check",
    description: "Your deposit is confirmed and being checked before it becomes available to Unshield or Send.",
    complete: false,
  });
  assert.deepEqual(getShieldOperationProgress("private_ready"), {
    step: 4,
    completedSteps: 4,
    label: "Ready",
    description: "Your private balance is ready to Unshield or Send.",
    complete: true,
  });
});

test("Shield confirmation copy follows the selected deployment network", () => {
  assert.deepEqual(
    getShieldOperationProgressForNetwork("submitted", "Ethereum"),
    {
      step: 2,
      completedSteps: 1,
      label: "Ethereum confirmation",
      description:
        "WalletChan is checking submission and waiting for confirmation on Ethereum.",
      complete: false,
    },
  );
  assert.equal(
    getPrivacyShieldActivityState("submitted", "Ethereum").context,
    "Confirming on Ethereum",
  );
  assert.equal(
    getPrivacyShieldActivityState("submitted", "Ethereum").statusLabel,
    "Confirming",
  );
  assert.deepEqual(
    getPrivacyShieldActivityState("public_confirmed", "Ethereum"),
    {
      context: "Compliance check pending",
      statusLabel: "Compliance check pending",
      tone: "warning",
      pending: true,
    },
  );
});

test("Shield compliance progress uses one hour but caps pending checks at 90 percent", () => {
  const confirmedAt = 1_000;
  assert.equal(SHIELD_COMPLIANCE_ESTIMATE_MS, 60 * 60_000);
  assert.equal(SHIELD_COMPLIANCE_PENDING_CAP_PERCENT, 90);
  assert.equal(
    getShieldComplianceProgressPercent("awaiting_asp", confirmedAt, confirmedAt),
    0,
  );
  assert.equal(
    getShieldComplianceProgressPercent(
      "awaiting_asp",
      confirmedAt,
      confirmedAt + 30 * 60_000,
    ),
    50,
  );
  assert.equal(
    getShieldComplianceProgressPercent(
      "public_confirmed",
      confirmedAt,
      confirmedAt + 30 * 60_000,
    ),
    50,
  );
  assert.equal(
    getShieldComplianceProgressPercent(
      "awaiting_asp",
      confirmedAt,
      confirmedAt + 54 * 60_000,
    ),
    90,
  );
  assert.equal(
    getShieldComplianceProgressPercent(
      "awaiting_asp",
      confirmedAt,
      confirmedAt + 3 * 60 * 60_000,
    ),
    90,
  );
  assert.equal(
    getShieldComplianceProgressPercent("private_ready", confirmedAt, confirmedAt),
    100,
  );
  assert.equal(
    getShieldComplianceProgressPercent("asp_approved", confirmedAt, confirmedAt),
    100,
  );
  assert.equal(
    getShieldComplianceProgressPercent("submitted", confirmedAt, confirmedAt),
    null,
  );
});

test("failed and attention states do not imply forward progress", () => {
  const terminalStates: ShieldPendingOperation["state"][] = [
    "asp_poi_required",
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

test("temporary ASP outages stay visually pending while action requirements remain distinct", () => {
  assert.deepEqual(
    getPrivacyShieldActivityState("asp_unavailable", "Ethereum"),
    {
      context: "Compliance check pending",
      statusLabel: "Compliance check pending",
      tone: "warning",
      pending: true,
    },
  );
  assert.deepEqual(
    getPrivacyShieldActivityState("asp_poi_required", "Ethereum"),
    {
      context: "Proof of Association required",
      statusLabel: "Action required",
      tone: "warning",
      pending: false,
    },
  );
  assert.equal(
    getShieldComplianceProgressPercent("asp_unavailable", 1_000, 1_000),
    0,
  );
  assert.deepEqual(
    getShieldOperationProgressForNetwork("asp_unavailable", "Ethereum"),
    getShieldOperationProgressForNetwork("awaiting_asp", "Ethereum"),
  );
  assert.equal(isPrivacyShieldPublicRecoveryAvailable("asp_unavailable"), true);
  assert.equal(isPrivacyShieldPublicRecoveryAvailable("asp_poi_required"), true);
  assert.equal(isPrivacyShieldPublicRecoveryAvailable("asp_approved"), false);
  assert.equal(isPrivacyShieldPublicRecoveryAvailable("private_ready"), false);
});

test("public approval is complete while private readiness remains unlock-gated", () => {
  assert.deepEqual(
    getPrivacyShieldActivityState("asp_approved", "Ethereum"),
    {
      context: "Compliance check complete",
      statusLabel: "Confirmed",
      tone: "success",
      pending: false,
    },
  );
  assert.deepEqual(
    getShieldOperationProgressForNetwork("asp_approved", "Ethereum"),
    {
      step: 4,
      completedSteps: 4,
      label: "Compliance check complete",
      description: "Privacy Pools approved this deposit. Unlock WalletChan to use it.",
      complete: true,
    },
  );
  assert.deepEqual(
    getPrivacyShieldActivityState("private_ready", "Ethereum"),
    {
      context: "Ready to Unshield or Send",
      statusLabel: "Confirmed",
      tone: "success",
      pending: false,
    },
  );
});
