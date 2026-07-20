import assert from "node:assert/strict";
import test from "node:test";

import * as facade from "../../src/chrome/txSimulation";
import { simulateBatchAssetChanges } from "../../src/chrome/simulation/batchSimulation";
import { getNativeCurrency } from "../../src/chrome/simulation/nativeCurrency";
import { retryTokenMetadata } from "../../src/chrome/simulation/metadataRetry";
import { simulateBatchAssetChangesNonAtomic } from "../../src/chrome/simulation/nonAtomicBatch";
import { simulateAssetChanges } from "../../src/chrome/simulation/singleSimulation";
import { simulateSafeAssetChanges } from "../../src/chrome/simulation/safeSimulation";
import { SIMULATOR_BYTECODE } from "../../src/chrome/simulation/simulatorContract";

test("txSimulation preserves stable runtime export identities", () => {
  assert.equal(facade.simulateAssetChanges, simulateAssetChanges);
  assert.equal(facade.simulateSafeAssetChanges, simulateSafeAssetChanges);
  assert.equal(facade.simulateBatchAssetChanges, simulateBatchAssetChanges);
  assert.equal(
    facade.simulateBatchAssetChangesNonAtomic,
    simulateBatchAssetChangesNonAtomic,
  );
  assert.equal(facade.retryTokenMetadata, retryTokenMetadata);
  assert.equal(facade.getNativeCurrency, getNativeCurrency);
  assert.equal(facade.SIMULATOR_BYTECODE, SIMULATOR_BYTECODE);
});
