import assert from "node:assert/strict";
import test from "node:test";
import { shouldConfirmSimulationFailure } from "../../src/components/RequestConfirmation/simulationFailure";

test("an explicit transaction simulation revert requires a second confirmation", () => {
  assert.equal(
    shouldConfirmSimulationFailure({ simulationReverted: true }),
    true,
  );
});

test("a failed batch gas estimate requires a second confirmation", () => {
  assert.equal(
    shouldConfirmSimulationFailure({
      simulationReverted: false,
      gasEstimateFailed: true,
    }),
    true,
  );
});

test("a request without an explicit failure confirms normally", () => {
  assert.equal(
    shouldConfirmSimulationFailure({
      simulationReverted: false,
      gasEstimateFailed: false,
    }),
    false,
  );
});
