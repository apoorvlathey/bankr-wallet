import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as facade from "../../src/chrome/bundleStatusStorage";
import * as implementation from "../../src/chrome/batch/bundleStatusStorage";

test("bundle-status facade preserves every repository export identity", () => {
  for (const name of [
    "cleanupOldBundleStatuses",
    "getBundleStatus",
    "getBundleStatuses",
    "removeBundleStatus",
    "saveBundleStatus",
    "updateBundleStatus",
  ] as const) {
    assert.equal(facade[name], implementation[name], name);
  }
});

test("bundle-status ownership keeps the released key, cap, retention, and lock", async () => {
  const root = await readFile(
    new URL("../../src/chrome/bundleStatusStorage.ts", import.meta.url),
    "utf8",
  );
  const repository = await readFile(
    new URL(
      "../../src/chrome/batch/bundleStatusStorage.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(root.split("\n").length <= 15);
  assert.doesNotMatch(root, /chrome\.storage|withStorageLock/);
  assert.match(repository, /STORAGE_KEY = "bundleStatuses"/);
  assert.match(repository, /MAX_ENTRIES = 100/);
  assert.match(repository, /RETENTION_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(repository, /withStorageLock\(BUNDLE_STATUS_LOCK_KEY/);
  assert.ok(repository.split("\n").length <= 100);
});

test("batch and recovery domains use the repository owner directly", async () => {
  for (const file of [
    "batch/batchRequestIntake.ts",
    "batch/batchSequentialExecution.ts",
    "crossDappBatch/completion.ts",
    "forceInclusion/splitBatchSequencer.ts",
    "requests/pendingRequestTerminalization.ts",
  ]) {
    const source = await readFile(
      new URL(`../../src/chrome/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /["']\.\.\/bundleStatusStorage["']/);
  }
});
