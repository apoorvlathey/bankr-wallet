import assert from "node:assert/strict";
import test from "node:test";

import { mergeNonAtomicSimulationResults } from "../../src/chrome/simulation/nonAtomicBatch";
import type { AssetChange, SimulationResult } from "../../src/chrome/simulation/types";

function change(address: string, nft = false): AssetChange {
  return {
    address,
    symbol: "TKN",
    name: "Token",
    decimals: nft ? 0 : 18,
    rawDelta: "1",
    formattedAmount: "1",
    valueUsd: null,
    direction: "in",
    ...(nft
      ? { nft: { standard: "erc721" as const, tokenId: "1", amount: "1" } }
      : {}),
  };
}

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

test("non-atomic mapping fails closed only when both paths are unavailable", () => {
  const merged = mergeNonAtomicSimulationResults(null, null);
  assert.equal(merged.simulationFailed, true);
  assert.equal(merged.simulationError, "Batch simulation failed");

  const v1 = result({ txSuccess: false });
  assert.equal(mergeNonAtomicSimulationResults(v1, null), v1);
});

test("non-atomic mapping keeps v1 fungibles and bytecode NFTs/verdict", () => {
  const shared = "0x1111111111111111111111111111111111111111";
  const byteOnly = "0x2222222222222222222222222222222222222222";
  const nft = "0x3333333333333333333333333333333333333333";
  const v1 = result({ tokenChanges: [change(shared)], metadataComplete: false });
  const byte = result({
    txSuccess: false,
    tokenChanges: [change(shared), change(byteOnly), change(nft, true)],
  });

  const merged = mergeNonAtomicSimulationResults(v1, byte);
  assert.equal(merged.txSuccess, false);
  assert.deepEqual(
    merged.tokenChanges.map((entry) => entry.address),
    [shared, byteOnly, nft],
  );
  assert.equal(merged.metadataComplete, false);
});
