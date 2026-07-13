import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

test("account reordering persists only exact permutations", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: structuredClone(local[key]) };
          },
          async set(values: StorageRecord) {
            Object.assign(local, structuredClone(values));
          },
          async remove(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete local[key];
            }
          },
        },
        sync: {
          async get() {
            return {};
          },
          async set() {},
          async remove() {},
        },
      },
    },
  });

  try {
    const {
      addImpersonatorAccount,
      addPrivateKeyAccount,
      addSeedPhraseAccount,
      reorderAccounts,
    } = await import("../../src/chrome/accountStorage");
    const accounts = [
      {
        id: "bankr",
        type: "impersonator",
        address: `0x${"11".repeat(20)}`,
        displayName: "Bankr",
        createdAt: 1,
      },
      {
        id: "private-key",
        type: "privateKey",
        address: `0x${"22".repeat(20)}`,
        displayName: "Private key",
        createdAt: 2,
      },
      {
        id: "seed-phrase",
        type: "seedPhrase",
        address: `0x${"33".repeat(20)}`,
        displayName: "Seed phrase",
        createdAt: 3,
        seedGroupId: "seed-group",
        derivationIndex: 0,
      },
    ];

    const reset = () => {
      local.accounts = structuredClone(accounts);
    };

    await t.test("supports every wallet type and preserves metadata", async () => {
      reset();
      const reordered = await reorderAccounts([
        "seed-phrase",
        "bankr",
        "private-key",
      ]);

      assert.deepEqual(
        reordered.map(({ id }) => id),
        ["seed-phrase", "bankr", "private-key"],
      );
      assert.deepEqual(local.accounts, reordered);
      assert.deepEqual(reordered[0], accounts[2]);
    });

    await t.test("rejects missing, duplicate, unknown, and malformed IDs", async () => {
      for (const invalidOrder of [
        ["bankr", "private-key"],
        ["bankr", "bankr", "seed-phrase"],
        ["bankr", "private-key", "unknown"],
        "bankr,private-key,seed-phrase",
      ]) {
        reset();
        await assert.rejects(reorderAccounts(invalidOrder), /account order/i);
        assert.deepEqual(local.accounts, accounts);
      }
    });

    await t.test("rejects malformed addresses and seed metadata at storage boundary", async () => {
      for (const add of [
        () => addImpersonatorAccount("not-an-address"),
        () => addPrivateKeyAccount(`0x${"11".repeat(19)}`),
        () =>
          addSeedPhraseAccount(
            `0x${"44".repeat(20)}`,
            "",
            -1,
          ),
      ]) {
        reset();
        await assert.rejects(add);
        assert.deepEqual(local.accounts, accounts);
      }
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  }
});
