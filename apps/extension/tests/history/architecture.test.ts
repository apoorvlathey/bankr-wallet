import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("history root paths remain policy-free identity-preserving facades", async () => {
  const [historyFacade, assetFacade, receiptFacade] = await Promise.all([
    import("../../src/chrome/txHistoryStorage"),
    import("../../src/chrome/assetChangesExtractor"),
    import("../../src/chrome/receiptEnrichment"),
  ]);
  const [repository, maintenance, assetPersistence, transport, enrichment] =
    await Promise.all([
      import("../../src/chrome/history/repository"),
      import("../../src/chrome/history/maintenance"),
      import("../../src/chrome/history/assetChangePersistence"),
      import("../../src/chrome/history/receiptTransport"),
      import("../../src/chrome/history/receiptEnrichment"),
    ]);

  for (const name of [
    "addTxToHistory",
    "getPendingConfirmationTxs",
    "getProcessingTxs",
    "getTxById",
    "getTxHistory",
    "updateTxInHistory",
  ] as const) {
    assert.equal(historyFacade[name], repository[name], name);
  }
  for (const name of [
    "cleanupStaleProcessingTxs",
    "clearTxHistory",
    "clearTxHistoryForAddresses",
  ] as const) {
    assert.equal(historyFacade[name], maintenance[name], name);
  }
  for (const name of [
    "extractAndStoreAssetChanges",
    "extractAndStoreDestinationAssetChanges",
  ] as const) {
    assert.equal(assetFacade[name], assetPersistence[name], name);
  }
  for (const name of [
    "fetchBundleReceipt",
    "fetchRawTransactionReceipt",
    "toBundleReceipt",
  ] as const) {
    assert.equal(receiptFacade[name], transport[name], name);
  }
  for (const name of [
    "extractAssetChangesFromReceipt",
    "extractAssetChangesWhenReceiptAvailable",
    "queueAssetChangesBackfill",
  ] as const) {
    assert.equal(receiptFacade[name], enrichment[name], name);
  }
});

test("history implementations keep one-way audit boundaries", async () => {
  const names = [
    "history/types.ts",
    "history/gasDataPolicy.ts",
    "history/assetTransferParser.ts",
    "history/repository.ts",
    "history/maintenance.ts",
    "history/rpc.ts",
    "history/nativeDelta.ts",
    "history/assetChangeExtraction.ts",
    "history/assetChangePersistence.ts",
    "history/receiptGasData.ts",
    "history/receiptSettlement.ts",
    "history/receiptReconciliation.ts",
    "history/receiptTransport.ts",
    "history/receiptEnrichment.ts",
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readModule(name)] as const),
    ),
  );

  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(
      source,
      /from ["']\.\.\/(?:txHistoryStorage|assetChangesExtractor|receiptEnrichment)["']/,
      `${name} must not import a root compatibility facade`,
    );
  }
  assert.doesNotMatch(sources["history/types.ts"], /chrome\.|fetchRpcResult/);
  assert.doesNotMatch(
    sources["history/gasDataPolicy.ts"],
    /chrome\.|fetchRpcResult/,
  );
  assert.doesNotMatch(
    sources["history/assetTransferParser.ts"],
    /chrome\.|fetchRpcResult|resolveTokenMetadata/,
  );
  assert.match(sources["history/repository.ts"], /from ["']\.\.\/storageLock["']/);
  assert.doesNotMatch(sources["history/repository.ts"], /fetchRpcResult|resolveTokenMetadata/);
  assert.match(sources["history/maintenance.ts"], /from ["']\.\/repository["']/);
  assert.doesNotMatch(sources["history/maintenance.ts"], /fetchRpcResult|resolveTokenMetadata/);
  assert.match(sources["history/rpc.ts"], /from ["']\.\.\/network\/rpcClient["']/);
  assert.doesNotMatch(sources["history/rpc.ts"], /chrome\.storage/);
  assert.doesNotMatch(sources["history/nativeDelta.ts"], /chrome\.|fetchRpcResult/);
  assert.doesNotMatch(sources["history/receiptGasData.ts"], /chrome\.|fetchRpcResult/);
  assert.match(
    sources["history/assetChangeExtraction.ts"],
    /from ["']\.\/assetTransferParser["']/,
  );
  assert.doesNotMatch(sources["history/assetChangeExtraction.ts"], /chrome\.|updateTxInHistory/);
  assert.match(
    sources["history/assetChangePersistence.ts"],
    /from ["']\.\/repository["']/,
  );
  assert.doesNotMatch(sources["history/assetChangePersistence.ts"], /chrome\./);
  assert.match(sources["history/receiptTransport.ts"], /from ["']\.\/rpc["']/);
  assert.doesNotMatch(sources["history/receiptTransport.ts"], /getTxById|updateTxInHistory/);
  assert.match(
    sources["history/receiptReconciliation.ts"],
    /from ["']\.\/repository["']/,
  );
});

test("history facades and implementations stay audit-sized", async () => {
  const budgets: Record<string, number> = {
    "txHistoryStorage.ts": 40,
    "assetChangesExtractor.ts": 15,
    "receiptEnrichment.ts": 20,
    "history/types.ts": 190,
    "history/forceInclusionTypes.ts": 30,
    "history/gasDataPolicy.ts": 35,
    "history/assetTransferParser.ts": 80,
    "history/repository.ts": 90,
    "history/maintenance.ts": 80,
    "history/rpc.ts": 140,
    "history/nativeDelta.ts": 40,
    "history/assetChangeExtraction.ts": 110,
    "history/assetChangePersistence.ts": 100,
    "history/receiptGasData.ts": 40,
    "history/receiptSettlement.ts": 100,
    "history/receiptReconciliation.ts": 90,
    "history/receiptTransport.ts": 60,
    "history/receiptEnrichment.ts": 110,
  };
  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readModule(name);
    const lines = source.split("\n").length;
    assert.ok(lines <= maximumLines, `${name} has ${lines} lines; budget is ${maximumLines}`);
  }

  for (const name of [
    "txHistoryStorage.ts",
    "assetChangesExtractor.ts",
    "receiptEnrichment.ts",
  ]) {
    const source = await readModule(name);
    assert.match(source, /compatibility facade/i);
    assert.doesNotMatch(source, /\b(?:async )?function\b|chrome\.|fetchRpcResult/);
  }

  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
  );
  assert.deepEqual(
    rootEntries
      .filter((name) => /^(?:txHistory|assetChanges|receiptEnrichment)/.test(name))
      .sort(),
    ["assetChangesExtractor.ts", "receiptEnrichment.ts", "txHistoryStorage.ts"],
  );
  assert.match(await readModule("history/README.md"), /Review this domain in dependency order/);
});
