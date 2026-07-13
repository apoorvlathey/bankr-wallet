import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as batchFacade from "../../src/chrome/batchGasEstimation";
import * as batchEstimator from "../../src/chrome/gas/batchEstimator";
import * as feeFacade from "../../src/chrome/feeEstimation";
import * as feeEstimator from "../../src/chrome/gas/feeEstimator";
import * as feePolicy from "../../src/chrome/gas/feePolicy";
import * as gasClient from "../../src/chrome/gas/client";
import * as gasFacade from "../../src/chrome/gasEstimation";
import * as singleEstimator from "../../src/chrome/gas/singleEstimator";
import * as singlePolicy from "../../src/chrome/gas/singlePolicy";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("gas compatibility facades preserve every public implementation identity", () => {
  assert.equal(feeFacade.estimateFees, feeEstimator.estimateFees);
  assert.equal(feeFacade.estimateFeeTiers, feeEstimator.estimateFeeTiers);
  assert.equal(
    feeFacade.CUSTOM_TIER_BASE_FEE_MULT_NUM,
    feePolicy.CUSTOM_TIER_BASE_FEE_MULT_NUM,
  );
  assert.equal(
    feeFacade.CUSTOM_TIER_BASE_FEE_MULT_DEN,
    feePolicy.CUSTOM_TIER_BASE_FEE_MULT_DEN,
  );
  assert.equal(gasFacade.estimateGas, singleEstimator.estimateGas);
  assert.equal(gasFacade.fetchNativePrice, gasClient.fetchNativePrice);
  assert.equal(
    gasFacade.estimateGasLimitWithBuffer,
    gasClient.estimateGasLimitWithBuffer,
  );
  assert.equal(
    gasFacade.bumpGasForEip7702Auth,
    singlePolicy.bumpGasForEip7702Auth,
  );
  assert.equal(
    batchFacade.estimateBatchGasSequential,
    batchEstimator.estimateBatchGasSequential,
  );
});

test("gas compatibility facades contain no policy or RPC effects", async () => {
  for (const path of [
    "feeEstimation.ts",
    "gasEstimation.ts",
    "batchGasEstimation.ts",
  ]) {
    const text = await source(path);
    assert.ok(text.split("\n").length <= 20, path);
    assert.doesNotMatch(
      text,
      /\b(?:function|createPublicClient|fetch|chrome\.|BigInt|Map)\b/,
      path,
    );
  }
});

test("gas domain dependencies flow from pure policy and RPC leaves into coordinators", async () => {
  const policy = await source("gas/feePolicy.ts");
  assert.doesNotMatch(policy, /from ["']\.\.\//);
  assert.doesNotMatch(policy, /\b(?:client|request|fetch|chrome\.)\b/);

  const feeRpc = await source("gas/feeRpc.ts");
  assert.doesNotMatch(feeRpc, /from ["']\.\/(?:feeEstimator|singleEstimator|batchEstimator)["']/);
  const fee = await source("gas/feeEstimator.ts");
  assert.match(fee, /from ["']\.\/feePolicy["']/);
  assert.match(fee, /from ["']\.\/feeRpc["']/);

  const single = await source("gas/singleEstimator.ts");
  assert.match(single, /from ["']\.\/client["']/);
  assert.match(single, /from ["']\.\/singlePolicy["']/);
  assert.doesNotMatch(single, /from ["']\.\/batchEstimator["']/);

  const batch = await source("gas/batchEstimator.ts");
  for (const dependency of [
    "batchFallback",
    "batchInjection",
    "batchResult",
    "batchSimulation",
  ]) {
    assert.match(batch, new RegExp(`from ["']\\./${dependency}["']`));
  }
  for (const leaf of [
    "gas/batchFallback.ts",
    "gas/batchInjection.ts",
    "gas/batchResult.ts",
    "gas/batchSimulation.ts",
  ]) {
    assert.doesNotMatch(
      await source(leaf),
      /from ["']\.\/(?:batchEstimator|singleEstimator)["']/,
      leaf,
    );
  }
});

test("gas modules remain independently auditable", async () => {
  const budgets: Record<string, number> = {
    "gas/types.ts": 80,
    "gas/feePolicy.ts": 110,
    "gas/feeRpc.ts": 100,
    "gas/feeEstimator.ts": 110,
    "gas/client.ts": 100,
    "gas/singlePolicy.ts": 70,
    "gas/singleEstimator.ts": 220,
    "gas/batchSimulation.ts": 130,
    "gas/batchInjection.ts": 130,
    "gas/batchFallback.ts": 60,
    "gas/batchResult.ts": 90,
    "gas/batchEstimator.ts": 130,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const lines = (await source(path)).split("\n").length;
    assert.ok(lines <= maximum, `${path}: ${lines} > ${maximum}`);
  }
});
