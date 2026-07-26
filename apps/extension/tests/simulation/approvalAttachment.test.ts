import assert from "node:assert/strict";
import test from "node:test";

import { attachApprovalProjection } from "../../src/chrome/simulation/approvalAttachment";
import type { ApprovalProjection } from "../../src/chrome/simulation/approvalSimulation";
import type { SimulationResult } from "../../src/chrome/simulation/types";

function result(
  overrides: Partial<SimulationResult> = {},
): SimulationResult {
  return {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    approvalChanges: [],
    approvalDetectionIncomplete: false,
    simulationFailed: false,
    metadataComplete: true,
    ...overrides,
  };
}

function projection(): ApprovalProjection {
  return {
    approvalChanges: [{
      verification: "verified",
    }] as ApprovalProjection["approvalChanges"],
    approvalDetectionIncomplete: false,
    metadataComplete: true,
  };
}

test("successful asset simulation receives the shared approval projection", async () => {
  const approval = projection();
  const attached = await attachApprovalProjection(
    result(),
    Promise.resolve(approval),
  );
  assert.equal(attached.approvalChanges, approval.approvalChanges);
});

test("an authoritative revert suppresses approval rows", async () => {
  const attached = await attachApprovalProjection(
    result({ txSuccess: false }),
    Promise.resolve(projection()),
  );
  assert.deepEqual(attached.approvalChanges, []);
});

test("an unavailable asset preview retains unverified approval fallback", async () => {
  const approval = projection();
  approval.approvalChanges[0].verification = "unverified";
  const attached = await attachApprovalProjection(
    result({ simulationFailed: true }),
    Promise.resolve(approval),
  );
  assert.equal(attached.approvalChanges[0]?.verification, "unverified");
});
