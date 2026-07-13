import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, any>;

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      clone(storage[key] ?? fallback),
    ]),
  );
}

test("legacy storage migration is linearizable and stale active IDs recover", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      // Preserve a realistic asynchronous boundary so overlapping migration
      // callers would both observe the pre-write state without serialization.
      await Promise.resolve();
      return selectStorageValues(storage, keys);
    },
    async set(values: StorageRecord) {
      await Promise.resolve();
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
      },
    },
  });

  try {
    const { migrateFromLegacyStorage } = await import(
      "../../src/chrome/legacyStorageMigration"
    );
    const { getActiveAccount } = await import("../../src/chrome/accountStorage");

    await t.test(
      "onInstalled and renderer fallback cannot commit different account IDs",
      async () => {
        local.encryptedApiKey = {
          ciphertext: "legacy",
          iv: "legacy",
          salt: "legacy",
        };
        sync.address = "0x1111111111111111111111111111111111111111";
        sync.displayAddress = "legacy.eth";

        const results = await Promise.all([
          migrateFromLegacyStorage(),
          migrateFromLegacyStorage(),
        ]);

        assert.deepEqual(results.sort(), [false, true]);
        assert.equal(local.accounts.length, 1);
        assert.equal(local.accounts[0].type, "bankr");
        assert.equal(local.accounts[0].address, sync.address);
        assert.equal(sync.activeAccountId, local.accounts[0].id);

        // Cross-area writes are not transactional. If the authoritative local
        // row survives but the sync mirror did not, ordinary account resolution
        // must still recover and persist the intact row.
        delete sync.activeAccountId;
        assert.deepEqual(await getActiveAccount(), local.accounts[0]);
        assert.equal(sync.activeAccountId, local.accounts[0].id);
      },
    );

    await t.test("malformed legacy addresses fail closed", async () => {
      for (const key of Object.keys(local)) delete local[key];
      for (const key of Object.keys(sync)) delete sync[key];
      local.encryptedApiKey = {
        ciphertext: "legacy",
        iv: "legacy",
        salt: "legacy",
      };
      sync.address = "0xnot-an-evm-address";

      assert.equal(await migrateFromLegacyStorage(), false);
      assert.equal(local.accounts, undefined);
      assert.equal(sync.activeAccountId, undefined);
      assert.deepEqual(local.encryptedApiKey, {
        ciphertext: "legacy",
        iv: "legacy",
        salt: "legacy",
      });
    });

    await t.test(
      "stale active IDs fall back and repair for every account type",
      async (walletTypeTest) => {
        const cases = [
          {
            id: "bankr-account",
            type: "bankr",
            address: "0x1111111111111111111111111111111111111111",
          },
          {
            id: "private-account",
            type: "privateKey",
            address: "0x2222222222222222222222222222222222222222",
          },
          {
            id: "seed-account",
            type: "seedPhrase",
            address: "0x3333333333333333333333333333333333333333",
            seedGroupId: "seed-group",
            derivationIndex: 0,
          },
        ];

        for (const account of cases) {
          await walletTypeTest.test(account.type, async () => {
            local.accounts = [{ ...account, createdAt: 1 }];
            sync.activeAccountId = "stale-migration-id";

            assert.deepEqual(await getActiveAccount(), local.accounts[0]);
            assert.equal(sync.activeAccountId, account.id);

            // A valid selection is never replaced merely because the repair
            // compatibility path exists.
            assert.deepEqual(await getActiveAccount(), local.accounts[0]);
            assert.equal(sync.activeAccountId, account.id);
          });
        }
      },
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
