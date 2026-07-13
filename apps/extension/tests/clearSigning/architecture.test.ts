import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChrome = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("clear-signing root paths preserve implementation export identities", async () => {
  const [handlerFacade, handlers, cache, settings, snapshotFacade, snapshot, history] =
    await Promise.all([
      import("../../src/chrome/clearSigningHandlers"),
      import("../../src/chrome/clearSigning/handlers"),
      import("../../src/chrome/clearSigning/descriptorCache"),
      import("../../src/chrome/clearSigning/settings"),
      import("../../src/chrome/clearSignedMetaSnapshot"),
      import("../../src/chrome/clearSigning/snapshot"),
      import("../../src/chrome/clearSigning/historyAttachment"),
    ]);

  assert.equal(
    handlerFacade.handleGetClearSigningDescriptor,
    handlers.handleGetClearSigningDescriptor,
  );
  assert.equal(
    handlerFacade.handleInvalidateClearSigningCache,
    cache.handleInvalidateClearSigningCache,
  );
  assert.equal(
    handlerFacade.getClearSigningEnabled,
    settings.getClearSigningEnabled,
  );
  assert.equal(
    handlerFacade.setClearSigningEnabled,
    settings.setClearSigningEnabled,
  );
  assert.equal(snapshotFacade.buildClearSignedMeta, snapshot.buildClearSignedMeta);
  assert.equal(
    snapshotFacade.attachClearSignedMetaToHistory,
    history.attachClearSignedMetaToHistory,
  );
});

test("clear-signing modules retain one-way effect boundaries", async () => {
  const names = [
    "clearSigning/types.ts",
    "clearSigning/descriptorCache.ts",
    "clearSigning/settings.ts",
    "clearSigning/descriptorClient.ts",
    "clearSigning/deploymentExtension.ts",
    "clearSigning/descriptorResolver.ts",
    "clearSigning/handlers.ts",
    "clearSigning/counterparty.ts",
    "clearSigning/assetSnapshotBuilders.ts",
    "clearSigning/erc7730Snapshot.ts",
    "clearSigning/snapshot.ts",
    "clearSigning/historyAttachment.ts",
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readChrome(name)] as const),
    ),
  );

  assert.doesNotMatch(
    sources["clearSigning/types.ts"],
    /chrome\.|fetch\(|history|proxyResolver/,
  );
  assert.doesNotMatch(
    sources["clearSigning/deploymentExtension.ts"],
    /chrome\.|fetch\(|proxyResolver|descriptorCache/,
  );
  assert.match(
    sources["clearSigning/descriptorClient.ts"],
    /from ["']\.\.\/network\/boundedHttp["']/,
  );
  assert.match(
    sources["clearSigning/descriptorResolver.ts"],
    /from ["']\.\.\/network\/proxyResolver["']/,
  );
  assert.doesNotMatch(
    sources["clearSigning/snapshot.ts"],
    /chrome\.|fetch\(|updateTxInHistory|descriptorCache/,
  );
  assert.match(
    sources["clearSigning/historyAttachment.ts"],
    /from ["']\.\.\/history\/repository["']/,
  );
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(?:clearSigningHandlers|clearSignedMetaSnapshot)["']/,
    );
  }
});

test("clear-signing facades and implementations stay audit-sized", async () => {
  const budgets: Record<string, number> = {
    "clearSigningHandlers.ts": 20,
    "clearSignedMetaSnapshot.ts": 10,
    "clearSigning/types.ts": 45,
    "clearSigning/descriptorCache.ts": 115,
    "clearSigning/settings.ts": 30,
    "clearSigning/descriptorClient.ts": 80,
    "clearSigning/deploymentExtension.ts": 50,
    "clearSigning/descriptorResolver.ts": 90,
    "clearSigning/handlers.ts": 125,
    "clearSigning/counterparty.ts": 35,
    "clearSigning/assetSnapshotBuilders.ts": 120,
    "clearSigning/erc7730Snapshot.ts": 135,
    "clearSigning/snapshot.ts": 80,
    "clearSigning/historyAttachment.ts": 70,
  };
  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readChrome(name);
    assert.ok(
      source.split("\n").length <= maximumLines,
      `${name} exceeds ${maximumLines} lines`,
    );
  }

  for (const name of ["clearSigningHandlers.ts", "clearSignedMetaSnapshot.ts"]) {
    const source = await readChrome(name);
    assert.doesNotMatch(
      source,
      /\b(?:const|let|class|function)\b|chrome\.|fetch\(/,
      name,
    );
  }

  const roots = (await readdir(new URL("../../src/chrome/", import.meta.url), {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isFile() && /^clearSign/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(roots, [
    "clearSignedMetaSnapshot.ts",
    "clearSigningHandlers.ts",
  ]);
});
