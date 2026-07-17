import assert from "node:assert/strict";
import test from "node:test";
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
    tx: { from: ADDRESS_A, to: ADDRESS_B, data: "0x", value: "0x0" },
    origin: "https://dapp.example",
    favicon: null,
    chainName: "Base",
    chainId: 8453,
    createdAt: Date.now(),
    ...overrides,
  } as CompletedTransaction;
}

test("history storage preserves ordering, locking, cleanup, and notifications", async () => {
  const harness = createChromeStorageHarness();
  try {
    const repository = await import("../../src/chrome/history/repository");
    const maintenance = await import("../../src/chrome/history/maintenance");

    for (let index = 0; index < 51; index++) {
      await repository.addTxToHistory(transaction(`tx-${index}`));
    }
    let history = await repository.getTxHistory();
    assert.equal(history.length, 50);
    assert.equal(history[0].id, "tx-50");
    assert.equal(history.at(-1)?.id, "tx-1");
    assert.deepEqual(harness.runtimeMessages.at(-1), {
      type: "txHistoryUpdated",
      updatedTx: history[0],
    });

    await Promise.all([
      repository.updateTxInHistory("tx-50", {
        status: "pending",
        txHash: "0xhash50",
      }),
      repository.updateTxInHistory("tx-49", {
        status: "pending",
        txHash: "0xhash49",
      }),
    ]);
    history = await repository.getTxHistory();
    assert.equal(history.find((entry) => entry.id === "tx-50")?.txHash, "0xhash50");
    assert.equal(history.find((entry) => entry.id === "tx-49")?.txHash, "0xhash49");
    assert.deepEqual(
      await repository.getPendingConfirmationTxs().then((entries) =>
        entries.map((entry) => entry.id),
      ),
      ["tx-50", "tx-49"],
    );
    assert.deepEqual(harness.runtimeMessages.at(-1), {
      type: "txHistoryUpdated",
      updatedTx: history.find((entry) => entry.id === "tx-49"),
      changedKeys: ["status", "txHash"],
    });

    const l1Gas = {
      gasUsed: "120000",
      gasLimit: "140000",
      effectiveGasPrice: "25000000000",
      feeSource: "forceInclusionL1" as const,
    };
    harness.stores.local.txHistory = [
      transaction("force-gas", {
        gasData: l1Gas,
        forceInclusionMeta: {
          l1TxHash: "0xl1",
          l1ChainId: 1,
          l2ChainId: 8453,
        },
      }),
    ];
    await repository.updateTxInHistory("force-gas", {
      gasData: {
        gasUsed: "100000",
        gasLimit: "100000",
        effectiveGasPrice: "0",
      },
    });
    assert.deepEqual((await repository.getTxById("force-gas"))?.gasData, l1Gas);

    const old = Date.now() - 10_000;
    harness.stores.local.txHistory = [
      transaction("stale", { createdAt: old }),
      transaction("force", {
        createdAt: old,
        forceInclusionMeta: {
          l1TxHash: "0xl1",
          l1ChainId: 1,
          l2ChainId: 8453,
        },
      }),
      transaction("fresh", { createdAt: Date.now() }),
    ];
    harness.clearObservations();
    await maintenance.cleanupStaleProcessingTxs(1_000);
    history = await repository.getTxHistory();
    assert.equal(history[0].status, "failed");
    assert.equal(history[0].error, "Transaction timed out");
    assert.equal(history[1].status, "processing");
    assert.equal(history[2].status, "processing");
    assert.deepEqual(harness.runtimeMessages, [{ type: "txHistoryUpdated" }]);

    harness.stores.local.txHistory = [
      transaction("remove", { tx: { from: ADDRESS_A.toUpperCase() } as any }),
      transaction("keep", { tx: { from: ADDRESS_B } as any }),
    ];
    harness.clearObservations();
    await maintenance.clearTxHistoryForAddresses([ADDRESS_A]);
    assert.deepEqual(
      (await repository.getTxHistory()).map((entry) => entry.id),
      ["keep"],
    );
    assert.deepEqual(harness.runtimeMessages, [{ type: "txHistoryUpdated" }]);

    harness.clearObservations();
    await maintenance.clearTxHistoryForAddresses([]);
    assert.equal(harness.writes.length, 0);
    assert.equal(harness.runtimeMessages.length, 0);

    await maintenance.clearTxHistory();
    assert.deepEqual(await repository.getTxHistory(), []);
    assert.deepEqual(harness.runtimeMessages, [{ type: "txHistoryUpdated" }]);
  } finally {
    harness.restore();
  }
});
