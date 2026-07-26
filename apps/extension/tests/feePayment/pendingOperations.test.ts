import assert from "node:assert/strict";
import test from "node:test";

import {
  getPendingUserOperations,
  savePendingUserOperation,
} from "../../src/chrome/feePayment/pendingOperations";

function installStorage(initial: unknown[] = []) {
  let value = initial;
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: async () => ({ pendingUserOperations: structuredClone(value) }),
          set: async (next: { pendingUserOperations: unknown[] }) => {
            await Promise.resolve();
            value = structuredClone(next.pendingUserOperations);
          },
        },
      },
    },
  });
}

function record(index: number) {
  return {
    version: 1 as const,
    family: "transaction" as const,
    txId: `tx-${index}`,
    userOperationHash: `0x${index.toString(16).padStart(64, "0")}` as const,
    sender: "0x1111111111111111111111111111111111111111" as const,
    chainId: 8453,
    createdAt: index,
  };
}

test("serializes concurrent pending UserOperation writes", async () => {
  installStorage();
  await Promise.all([
    savePendingUserOperation(record(1)),
    savePendingUserOperation(record(2)),
  ]);
  assert.deepEqual(
    (await getPendingUserOperations()).map((entry) => entry.txId),
    ["tx-1", "tx-2"],
  );
});

test("filters malformed rows and retains only the newest fifty records", async () => {
  installStorage([{ version: 1, txId: "malformed" }]);
  await Promise.all(
    Array.from({ length: 55 }, (_, index) =>
      savePendingUserOperation(record(index + 1)),
    ),
  );
  const records = await getPendingUserOperations();
  assert.equal(records.length, 50);
  assert.equal(records[0]?.txId, "tx-6");
  assert.equal(records[49]?.txId, "tx-55");
});

test("retains recoverable Safe execution UserOperations", async () => {
  installStorage([{ ...record(1), family: "safeExecution", txId: "safe-proposal" }]);
  const records = await getPendingUserOperations();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.family, "safeExecution");
  assert.equal(records[0]?.txId, "safe-proposal");
});

test("retains only bounded cross-dapp recovery fan-out routes", async () => {
  installStorage([{
    ...record(1),
    family: "crossDappBatch",
    txId: "cross-dapp-batch-1",
    crossDappResultRoute: {
      transactionIds: ["tx-1", "tx-1", "tx-2"],
      bundleIds: ["bundle-1"],
    },
  }]);
  const [stored] = await getPendingUserOperations();
  assert.equal(stored?.family, "crossDappBatch");
  assert.deepEqual(stored?.crossDappResultRoute, {
    transactionIds: ["tx-1", "tx-2"],
    bundleIds: ["bundle-1"],
  });

  installStorage([{
    ...record(2),
    family: "crossDappBatch",
    crossDappResultRoute: {
      transactionIds: ["x".repeat(129)],
      bundleIds: [],
    },
  }]);
  assert.deepEqual(await getPendingUserOperations(), []);
});
