import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { CompletedTransaction } from "../../src/chrome/history/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const ADDRESS_A = `0x${"a".repeat(40)}`;
const ADDRESS_B = `0x${"b".repeat(40)}`;

function transaction(
  id: string,
  overrides: Partial<CompletedTransaction> = {},
): CompletedTransaction {
  return {
    id,
    status: "processing",
    tx: { from: ADDRESS_A, to: ADDRESS_B, data: "0x12345678", value: "0x0", chainId: 8453 },
    origin: "https://dapp.example",
    favicon: null,
    chainName: "Base",
    chainId: 8453,
    createdAt: Date.now(),
    ...overrides,
  };
}

test("IndexedDB history migrates, compacts, pages, hydrates, and protects active rows", async () => {
  const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const originalKeyRange = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: IDBKeyRange });
  const legacy = transaction("legacy", {
    createdAt: 40,
    status: "success",
    txHash: `0x${"1".repeat(64)}`,
    assetChanges: {
      version: 2,
      blockNumber: "10",
      erc20Transfers: [],
      nftTransfers: [{
        token: ADDRESS_B,
        counterparty: ADDRESS_A,
        direction: "in",
        standard: "erc721",
        tokenId: "7",
        amount: "1",
        collectionName: "Must not persist",
        metadata: { name: "Must not persist", image: `data:image/png;base64,${"A".repeat(1000)}` },
      }],
    },
  });
  const harness = createChromeStorageHarness({ local: { txHistory: [legacy] } });
  try {
    const repository = await import("../../src/chrome/history/repository");
    const maintenance = await import("../../src/chrome/history/maintenance");
    const database = await import("../../src/chrome/history/database");

    const migrated = await repository.getTxById("legacy");
    assert.equal(harness.stores.local.txHistory, undefined);
    assert.equal(migrated?.tx.data, undefined);
    assert.equal(migrated?.calldataSelector, "0x12345678");
    assert.deepEqual(migrated?.assetChanges?.nftTransfers?.[0], {
      token: ADDRESS_B,
      counterparty: ADDRESS_A,
      direction: "in",
      standard: "erc721",
      tokenId: "7",
      amount: "1",
    });

    await repository.addTxToHistory(transaction("active", { createdAt: 30 }));
    assert.equal((await repository.getTxById("active"))?.tx.data, "0x12345678");
    await repository.updateTxInHistory("active", {
      status: "pending",
      txHash: `0x${"2".repeat(64)}`,
    });
    assert.equal((await repository.getTxById("active"))?.tx.data, undefined);

    await repository.addTxToHistory(transaction("newer", { createdAt: 20 }));
    await repository.addTxToHistory(transaction("older", { createdAt: 10 }));
    const first = await repository.getTxHistoryPage({ ownerAddress: ADDRESS_A, limit: 2 });
    assert.deepEqual(first.items.map((entry) => entry.id), ["legacy", "active"]);
    assert.equal(first.hasMore, true);
    const second = await repository.getTxHistoryPage({
      ownerAddress: ADDRESS_A,
      cursor: first.nextCursor,
      limit: 2,
    });
    assert.deepEqual(second.items.map((entry) => entry.id), ["newer", "older"]);

    assert.deepEqual(harness.runtimeMessages.at(-1), {
      type: "txHistoryUpdated",
      txId: "older",
      ownerAddress: ADDRESS_A,
      chainId: 8453,
    });

    await maintenance.clearTxHistoryForAddresses([ADDRESS_A]);
    assert.deepEqual(await repository.getTxHistory(), []);
    await database.resetHistoryDatabaseConnectionForTests();
  } finally {
    harness.restore();
    if (originalIndexedDb) Object.defineProperty(globalThis, "indexedDB", originalIndexedDb);
    else Reflect.deleteProperty(globalThis, "indexedDB");
    if (originalKeyRange) Object.defineProperty(globalThis, "IDBKeyRange", originalKeyRange);
    else Reflect.deleteProperty(globalThis, "IDBKeyRange");
  }
});
