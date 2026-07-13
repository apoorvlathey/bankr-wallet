import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("force-inclusion implementations live in one explicit audit domain", async () => {
  for (const path of [
    "forceInclusion/single.ts",
    "forceInclusion/batch.ts",
    "forceInclusion/splitBatchSequencer.ts",
    "forceInclusion/nonceManager.ts",
    "forceInclusion/receiptPoller.ts",
  ]) {
    const moduleSource = await source(path);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/background["']/);
    assert.doesNotMatch(moduleSource, /from ["']\.\.\/(?:forceInclusion|batchForceInclusion|nonceManager|txReceiptPoller|splitBatchSequencer)["']/);
  }
});

test("temporary root facades contain no policy and are background-only", async () => {
  const facades = {
    "forceInclusion.ts": "forceInclusion/single",
    "splitBatchSequencer.ts": "forceInclusion/splitBatchSequencer",
    "nonceManager.ts": "forceInclusion/nonceManager",
    "txReceiptPoller.ts": "forceInclusion/receiptPoller",
  } as const;
  for (const [path, target] of Object.entries(facades)) {
    const facade = await source(path);
    assert.match(facade, new RegExp(`export \\* from ["']\\./${target}["']`));
    assert.ok(facade.split("\n").length <= 5);
    assert.doesNotMatch(facade, /chrome\.|async function|storage|fetch\(/);
  }

  const background = await source("background.ts");
  for (const path of Object.keys(facades)) {
    assert.match(background, new RegExp(`["']\\./${path.replace(/\.ts$/, "")}["']`));
  }
});
