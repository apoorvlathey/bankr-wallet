import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

const DOMAIN_MODULES = [
    "forceInclusion/single.ts",
    "forceInclusion/batch.ts",
    "forceInclusion/types.ts",
    "forceInclusion/l1Client.ts",
    "forceInclusion/deposit.ts",
    "forceInclusion/singleHistory.ts",
    "forceInclusion/singleOutcome.ts",
    "forceInclusion/singleBankr.ts",
    "forceInclusion/singleLocal.ts",
    "forceInclusion/recovery.ts",
    "forceInclusion/batchTypes.ts",
    "forceInclusion/batchFailure.ts",
    "forceInclusion/batchCompletion.ts",
    "forceInclusion/batchBankr.ts",
    "forceInclusion/batchLocal.ts",
    "forceInclusion/batchLocalPreparation.ts",
    "forceInclusion/batchLocalBroadcast.ts",
    "forceInclusion/batchLocalReceipts.ts",
    "forceInclusion/receiptRpc.ts",
    "forceInclusion/receiptNotification.ts",
    "forceInclusion/receiptSideEffects.ts",
    "forceInclusion/receiptHistory.ts",
    "forceInclusion/receiptFinalizer.ts",
    "forceInclusion/receiptPolling.ts",
    "forceInclusion/splitBatchSequencer.ts",
    "forceInclusion/nonceManager.ts",
    "forceInclusion/receiptPoller.ts",
    "forceInclusion/broadcastPolicy.ts",
  ] as const;

test("force-inclusion implementations live in one explicit audit domain", async () => {
  for (const path of DOMAIN_MODULES) {
    const moduleSource = await source(path);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/background["']/);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/(?:forceInclusion|batchForceInclusion|nonceManager|txReceiptPoller|splitBatchSequencer)["']/);
  }
});

test("public force-inclusion entrypoints remain thin compatibility facades", async () => {
  for (const path of [
    "forceInclusion/single.ts",
    "forceInclusion/batch.ts",
    "forceInclusion/receiptPoller.ts",
  ]) {
    const moduleSource = await source(path);
    assert.doesNotMatch(moduleSource, /\b(?:async )?function\b/);
    assert.ok(moduleSource.split("\n").length <= 40);
  }
});

test("legacy root modules are removed and background imports the domain", async () => {
  const legacyRoots = [
    "forceInclusion.ts",
    "splitBatchSequencer.ts",
    "nonceManager.ts",
    "txReceiptPoller.ts",
    "batchForceInclusion.ts",
  ];
  for (const path of legacyRoots) {
    await assert.rejects(source(path), /ENOENT/);
  }
  const background = (
    await Promise.all([
      source("background/composition/advancedRoutes.ts"),
      source("background/composition/executionRoutes.ts"),
      source("background/composition/lifecycle.ts"),
    ])
  ).join("\n");
  for (const target of [
    "single",
    "splitBatchSequencer",
    "nonceManager",
    "receiptPoller",
  ]) {
    assert.match(background, new RegExp(`forceInclusion/${target}["']`));
  }
});
