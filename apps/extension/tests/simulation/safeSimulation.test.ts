import assert from "node:assert/strict";
import test from "node:test";
import type { SimulationResult } from "../../src/chrome/simulation/types";
import { mergeSafeSimulationResults } from "../../src/chrome/simulation/safeSimulation";

function result(overrides: Partial<SimulationResult> = {}): SimulationResult {
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

test("exact Safe envelope owns the verdict while Safe-owned deltas are preserved", () => {
  const tokenChanges = [{ address: "0xtoken" }] as SimulationResult["tokenChanges"];
  const merged = mergeSafeSimulationResults(
    result({ txSuccess: false, tokenChanges }),
    result({ txSuccess: true }),
  );

  assert.equal(merged.txSuccess, true);
  assert.equal(merged.simulationFailed, false);
  assert.equal(merged.tokenChanges, tokenChanges);
});

test("an exact Safe envelope revert cannot be hidden by successful underlying calls", () => {
  const approval = [{
    verification: "verified",
  }] as SimulationResult["approvalChanges"];
  const merged = mergeSafeSimulationResults(
    result({ txSuccess: true, approvalChanges: approval }),
    result({ txSuccess: false }),
  );
  assert.equal(merged.txSuccess, false);
  assert.equal(merged.simulationFailed, false);
  assert.deepEqual(merged.approvalChanges, []);
});

test("an unavailable exact envelope is reported as unavailable, not reverted", () => {
  const approval = [{
    previousAmount: "0",
    remainingAmount: "10",
    verification: "verified",
    changeType: "increase",
  }] as SimulationResult["approvalChanges"];
  const merged = mergeSafeSimulationResults(
    result({ txSuccess: false, approvalChanges: approval }),
    result({
      txSuccess: true,
      simulationFailed: true,
      simulationError: "RPC unavailable",
    }),
  );
  assert.equal(merged.txSuccess, true);
  assert.equal(merged.simulationFailed, true);
  assert.equal(merged.simulationError, "RPC unavailable");
  assert.equal(merged.approvalChanges[0]?.verification, "unverified");
  assert.equal(merged.approvalChanges[0]?.remainingAmount, null);
  assert.equal(merged.approvalDetectionIncomplete, true);
});
