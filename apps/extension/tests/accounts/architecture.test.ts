import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const chromeRoot = new URL("../../src/chrome/", import.meta.url);

const readChromeModule = (path: string) =>
  readFile(new URL(path, chromeRoot), "utf8");

test("account policy and signer boundaries have no legacy root implementations", async () => {
  const entries = await readdir(chromeRoot);
  for (const legacyName of [
    "legacyStorageMigration.ts",
    "tabAccountResolver.ts",
    "localAccountEffectBoundary.ts",
    "localAccountKeyResolver.ts",
  ]) {
    assert.ok(!entries.includes(legacyName), legacyName);
  }

  const accountStorage = await readChromeModule("accountStorage.ts");
  assert.match(accountStorage, /Stable account-storage facade/);
  assert.doesNotMatch(
    accountStorage,
    /legacyMigration|tabResolver|localEffectBoundary|localKeyResolver/,
    "the stable facade remains metadata-only",
  );
});

test("internal account boundaries depend directly on focused owners", async () => {
  const [migration, tabResolver, effectBoundary] = await Promise.all([
    readChromeModule("accounts/legacyMigration.ts"),
    readChromeModule("accounts/tabResolver.ts"),
    readChromeModule("accounts/localEffectBoundary.ts"),
  ]);

  assert.match(migration, /from ["']\.\/repository["']/);
  assert.match(migration, /from ["']\.\.\/storageLock["']/);
  assert.match(tabResolver, /from ["']\.\/repository["']/);
  assert.match(tabResolver, /from ["']\.\/selectionStorage["']/);
  assert.match(tabResolver, /from ["']\.\.\/dapp\/accountScope["']/);
  assert.match(tabResolver, /let latestActivation = 0/);
  assert.match(tabResolver, /activation === latestActivation/);
  assert.match(effectBoundary, /from ["']\.\/repository["']/);

  for (const source of [migration, tabResolver, effectBoundary]) {
    assert.doesNotMatch(source, /from ["']\.\.\/accountStorage["']/);
  }
});

test("legacy migration and local effects preserve their security order", async () => {
  const [migration, effectBoundary] = await Promise.all([
    readChromeModule("accounts/legacyMigration.ts"),
    readChromeModule("accounts/localEffectBoundary.ts"),
  ]);

  const lock = migration.indexOf("withStorageLock(");
  const reread = migration.indexOf('chrome.storage.local.get("accounts")');
  const localCommit = migration.indexOf("chrome.storage.local.set");
  const syncCommit = migration.indexOf("chrome.storage.sync.set");
  assert.ok(lock >= 0 && lock < reread && reread < localCommit);
  assert.ok(localCommit < syncCommit, "authoritative local row commits first");

  const lookup = effectBoundary.indexOf("getAccountById(expected.id)");
  const typeCheck = effectBoundary.indexOf("current.type !== expected.type");
  const addressCheck = effectBoundary.indexOf(
    "current.address.toLowerCase() !== expected.address.toLowerCase()",
  );
  const failure = effectBoundary.indexOf(
    'throw new Error("Signing account is no longer available")',
  );
  assert.ok(lookup >= 0 && lookup < typeCheck);
  assert.ok(typeCheck < addressCheck && addressCheck < failure);
});

test("local key resolution restores only Never sessions before decrypt fallback", async () => {
  const resolver = await readChromeModule("accounts/localKeyResolver.ts");
  const initialCache = resolver.indexOf("getPrivateKeyFromCache(accountId)");
  const timeout = resolver.indexOf("getAutoLockTimeout()");
  const neverGate = resolver.indexOf("autoLockTimeout === 0");
  const restore = resolver.indexOf("tryRestoreSession(handleUnlockWallet)");
  const vaultFallback = resolver.indexOf("const cachedVaultKey");
  const cacheCommit = resolver.indexOf("setCachedVault(vault)");
  const finalLookup = resolver.lastIndexOf("getPrivateKeyFromCache(accountId)");

  assert.ok(initialCache >= 0 && initialCache < timeout);
  assert.ok(timeout < neverGate && neverGate < restore);
  assert.ok(restore < vaultFallback && vaultFallback < cacheCommit);
  assert.ok(cacheCommit < finalLookup);
  assert.match(resolver, /if \(!vault\) return null/);
});

test("background, dapp, transaction, and delegated callers use direct account paths", async () => {
  const [accountComposition, lifecycleComposition, accountRouter, dappArchitecture, localBroadcast, delegated] =
    await Promise.all([
      readChromeModule("background/composition/accountRoutes.ts"),
      readChromeModule("background/composition/lifecycle.ts"),
      readChromeModule("background/accountStateRouter.ts"),
      readFile(new URL("../dapp/architecture.test.ts", import.meta.url), "utf8"),
      readChromeModule("transactions/swaps/localBroadcast.ts"),
      readChromeModule("erc7715/confirmation.ts"),
    ]);

  assert.match(accountComposition, /from ["']\.\.\/\.\.\/accounts\/legacyMigration["']/);
  assert.match(lifecycleComposition, /from ["']\.\.\/\.\.\/accounts\/tabResolver["']/);
  assert.match(accountRouter, /from ["']\.\.\/accounts\/tabResolver["']/);
  assert.match(dappArchitecture, /chrome\/accounts\/tabResolver\.ts/);
  assert.match(
    localBroadcast,
    /from ["']\.\.\/\.\.\/accounts\/localEffectBoundary["']/,
  );
  assert.match(
    delegated,
    /from ["']\.\.\/accounts\/localKeyResolver["']/,
  );
});
