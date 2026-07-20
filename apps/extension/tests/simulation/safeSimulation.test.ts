import assert from "node:assert/strict";
import test from "node:test";
import type { SimulationResult } from "../../src/chrome/simulation/types";
import { mergeSafeSimulationResults } from "../../src/chrome/simulation/safeSimulation";

function result(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
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
  const merged = mergeSafeSimulationResults(
    result({ txSuccess: true }),
    result({ txSuccess: false }),
  );
  assert.equal(merged.txSuccess, false);
  assert.equal(merged.simulationFailed, false);
});

test("an unavailable exact envelope is reported as unavailable, not reverted", () => {
  const merged = mergeSafeSimulationResults(
    result({ txSuccess: false }),
    result({
      txSuccess: true,
      simulationFailed: true,
      simulationError: "RPC unavailable",
    }),
  );
  assert.equal(merged.txSuccess, true);
  assert.equal(merged.simulationFailed, true);
  assert.equal(merged.simulationError, "RPC unavailable");
});
