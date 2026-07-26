import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("txSimulation is a policy-free stable facade", async () => {
  const coordinator = await source("txSimulation.ts");
  assert.match(coordinator, /from "\.\/simulation\/singleSimulation"/);
  assert.match(coordinator, /from "\.\/simulation\/batchSimulation"/);
  assert.match(coordinator, /from "\.\/simulation\/nonAtomicBatch"/);
  assert.match(coordinator, /from "\.\/simulation\/safeSimulation"/);
  assert.match(
    coordinator,
    /export type \{[\s\S]*SimulationResult[\s\S]*\} from "\.\/simulation\/types"/,
  );
  assert.doesNotMatch(coordinator, /\b(?:function|fetch|chrome\.|viem)\b/);
  assert.ok(coordinator.split("\n").length <= 40);
});

test("focused simulation modules do not depend on coordinator or authority domains", async () => {
  for (const path of [
    "simulation/types.ts",
    "simulation/constants.ts",
    "simulation/approvalTypes.ts",
    "simulation/approvalAbis.ts",
    "simulation/approvalAttachment.ts",
    "simulation/approvalAllowanceState.ts",
    "simulation/approvalIntents.ts",
    "simulation/approvalLogs.ts",
    "simulation/approvalMetadata.ts",
    "simulation/approvalProjection.ts",
    "simulation/approvalSimulation.ts",
    "simulation/residualApprovalCandidates.ts",
    "simulation/residualApprovalProjection.ts",
    "simulation/residualApprovalTrace.ts",
    "simulation/residualAllowanceSimulation.ts",
    "simulation/residualApprovalRequestTypes.ts",
    "simulation/stateOverrides.ts",
    "simulation/ethSimulateClient.ts",
    "simulation/ethSimulateLogs.ts",
    "simulation/client.ts",
    "simulation/nativeCurrency.ts",
    "simulation/portfolioPrices.ts",
    "simulation/assetChangeNormalization.ts",
    "simulation/nftEnrichment.ts",
    "simulation/tokenEnrichment.ts",
    "simulation/metadataRetry.ts",
    "simulation/resultBuilder.ts",
    "simulation/simulatorContract.ts",
    "simulation/simulatorOverride.ts",
    "simulation/erc7715Preview.ts",
    "simulation/singleSimulation.ts",
    "simulation/batchCandidates.ts",
    "simulation/batchSimulation.ts",
    "simulation/ethSimulateBatch.ts",
    "simulation/nonAtomicBatch.ts",
    "simulation/safeSimulation.ts",
  ]) {
    const moduleSource = await source(path);
    assert.ok(moduleSource.split("\n").length <= 400, `${path} exceeds 400 lines`);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/txSimulation["']/);
    assert.doesNotMatch(moduleSource, /background|sessionCache|authHandlers/);
    assert.doesNotMatch(moduleSource, /localSigner|walletConnect|bankr(?:Api|\/)/);
    assert.doesNotMatch(moduleSource, /chrome\.storage/);
  }
});
