import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChrome = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("storage root paths preserve implementation export identities", async () => {
  const [
    lockFacade,
    lock,
    resetFacade,
    resetManifest,
    waiterFacade,
    waiter,
    prunerFacade,
    cachePolicy,
    cachePruner,
  ] = await Promise.all([
    import("../../src/chrome/storageLock"),
    import("../../src/chrome/storage/lock"),
    import("../../src/chrome/walletResetStorage"),
    import("../../src/chrome/storage/resetManifest"),
    import("../../src/chrome/storageResultWaiter"),
    import("../../src/chrome/storage/resultWaiter"),
    import("../../src/chrome/storageCachePruner"),
    import("../../src/chrome/storage/cachePolicy"),
    import("../../src/chrome/storage/cachePruner"),
  ]);

  for (const name of [
    "WALLET_SECRET_OPERATION_LOCK_KEY",
    "WALLET_SECRET_STORAGE_LOCK_KEY",
    "withStorageLock",
  ] as const) {
    assert.equal(lockFacade[name], lock[name], name);
  }
  for (const name of [
    "WALLET_ARTIFACT_STORAGE_PREFIXES",
    "WALLET_LOCAL_STORAGE_KEYS",
    "WALLET_LOCAL_STORAGE_PREFIXES",
    "WALLET_RESULT_STORAGE_PREFIXES",
    "WALLET_SYNC_STORAGE_KEYS",
    "getStorageKeysWithPrefixes",
    "getWalletLocalStorageKeysToRemove",
  ] as const) {
    assert.equal(resetFacade[name], resetManifest[name], name);
  }
  assert.equal(
    waiterFacade.waitForStorageResult,
    waiter.waitForStorageResult,
  );
  assert.equal(
    prunerFacade.CACHE_PRUNE_INTERVAL_MS,
    cachePolicy.CACHE_PRUNE_INTERVAL_MS,
  );
  assert.equal(
    prunerFacade.pruneNonCriticalStorageCaches,
    cachePruner.pruneNonCriticalStorageCaches,
  );
});

test("shared storage implementations retain one-way dependencies", async () => {
  const sources = Object.fromEntries(
    await Promise.all(
      [
        "storage/lock.ts",
        "storage/resetManifest.ts",
        "storage/cachePolicy.ts",
        "storage/cachePruner.ts",
        "storage/resultWaiter.ts",
      ].map(async (name) => [name, await readChrome(name)] as const),
    ),
  );

  for (const name of [
    "storage/lock.ts",
    "storage/resetManifest.ts",
    "storage/cachePolicy.ts",
  ]) {
    assert.doesNotMatch(
      sources[name],
      /chrome\.(?:storage|runtime)\.|from ["'][^"']+\/[^"']+["']/,
    );
  }
  assert.match(
    sources["storage/cachePruner.ts"],
    /from ["']\.\/cachePolicy["']/,
  );
  assert.match(
    sources["storage/cachePruner.ts"],
    /from ["']\.\.\/portfolio\/holdingsCache["']/,
  );
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(?:storageLock|walletResetStorage|storageCachePruner|storageResultWaiter)["']/,
    );
  }
});

test("storage facades and implementations remain audit-sized", async () => {
  const budgets: Record<string, number> = {
    "storageLock.ts": 15,
    "walletResetStorage.ts": 20,
    "storageCachePruner.ts": 15,
    "storageResultWaiter.ts": 15,
    "storage/lock.ts": 45,
    "storage/resetManifest.ts": 120,
    "storage/cachePolicy.ts": 230,
    "storage/cachePruner.ts": 70,
    "storage/resultWaiter.ts": 110,
  };

  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readChrome(name);
    assert.ok(
      source.split("\n").length <= maximumLines,
      `${name} exceeds ${maximumLines} lines`,
    );
  }

  for (const name of [
    "storageLock.ts",
    "walletResetStorage.ts",
    "storageCachePruner.ts",
    "storageResultWaiter.ts",
  ]) {
    const source = await readChrome(name);
    assert.doesNotMatch(
      source,
      /\b(?:const|let|class|function)\b|chrome\./,
      name,
    );
  }

  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  const roots = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(?:storage(?:CachePruner|Lock|ResultWaiter)|walletResetStorage)\.ts$/.test(
          entry.name,
        ),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(roots, [
    "storageCachePruner.ts",
    "storageLock.ts",
    "storageResultWaiter.ts",
    "walletResetStorage.ts",
  ]);
});
