import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { FROZEN_LEGACY_SECRET_FIXTURE } from "../fixtures/legacySecretVaults";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const currentKeystore = {
  ciphertext: Buffer.alloc(32, 0x31).toString("base64"),
  iv: Buffer.alloc(12, 0x32).toString("base64"),
  salt: "",
};

test("released pkVault V1 codec is bounded and mutation-safe", async (t) => {
  const chromeHarness = createChromeStorageHarness();
  try {
    const codec = await import("../../src/chrome/vault/recordCodec");
    const repository = await import("../../src/chrome/vault/repository");
    const operations = await import("../../src/chrome/vault/operations");
    const migration = await import(
      "../../src/chrome/auth/legacyVaultKeyMigration"
    );

    const resetVault = (pkVault: unknown) => {
      for (const key of Object.keys(chromeHarness.stores.local)) {
        delete chromeHarness.stores.local[key];
      }
      chromeHarness.stores.local.pkVault = structuredClone(pkVault);
      chromeHarness.clearObservations();
    };

    await t.test("frozen released V1 survives decode byte-for-byte", async () => {
      const frozen = structuredClone(FROZEN_LEGACY_SECRET_FIXTURE.pkVault);
      const serialized = JSON.stringify(frozen);
      assert.equal(codec.parseReleasedVaultV1(frozen), frozen);
      assert.equal(JSON.stringify(frozen), serialized);

      resetVault(frozen);
      assert.deepEqual(await repository.loadVault(), frozen);
      assert.equal(JSON.stringify(chromeHarness.stores.local.pkVault), serialized);
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("current vault-key entries and duplicate V1 IDs stay readable", async () => {
      const duplicate = {
        version: 1,
        entries: [
          { id: "historical-race", keystore: currentKeystore },
          { id: "historical-race", keystore: currentKeystore },
        ],
      };
      resetVault(duplicate);
      assert.deepEqual(await repository.loadVault(), duplicate);
      assert.throws(
        () => codec.assertVaultSafeForMutation(duplicate),
        /duplicate account IDs/i,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("unknown, malformed, and oversized records fail closed", async () => {
      const invalidRecords = [
        { version: 2, entries: [] },
        { version: 1, entries: "not-an-array" },
        {
          version: 1,
          entries: [{ id: "bad-iv", keystore: { ...currentKeystore, iv: "AA==" } }],
        },
        {
          version: 1,
          entries: [{ id: "bad-salt", keystore: { ...currentKeystore, salt: "AA==" } }],
        },
        {
          version: 1,
          entries: [{ id: "bad-ciphertext", keystore: { ...currentKeystore, ciphertext: "AA==" } }],
        },
        {
          version: 1,
          entries: [
            {
              id: "x".repeat(codec.MAX_VAULT_ENTRY_ID_LENGTH + 1),
              keystore: currentKeystore,
            },
          ],
        },
        {
          version: 1,
          entries: Array.from(
            { length: codec.MAX_VAULT_ENTRIES + 1 },
            (_, index) => ({ id: `entry-${index}`, keystore: currentKeystore }),
          ),
        },
      ];

      for (const record of invalidRecords) {
        resetVault(record);
        await assert.rejects(repository.loadVault(), /unsupported or corrupt/i);
        await assert.rejects(
          operations.removeKeyFromVault("target"),
          /unsupported or corrupt/i,
        );
        assert.deepEqual(chromeHarness.writes, []);
      }
    });

    await t.test("duplicate add, remove, save, and migration prepare make zero writes", async () => {
      const duplicate = {
        version: 1,
        entries: [
          { id: "duplicate", keystore: currentKeystore },
          { id: "duplicate", keystore: currentKeystore },
        ],
      };
      resetVault(duplicate);

      await assert.rejects(
        operations.addKeyToVault(
          "new-account",
          `0x${"11".repeat(32)}`,
          "master-password",
        ),
        /duplicate account IDs/i,
      );
      await assert.rejects(
        operations.removeKeyFromVault("duplicate"),
        /duplicate account IDs/i,
      );
      await assert.rejects(
        repository.saveVault(duplicate as never),
        /duplicate account IDs/i,
      );
      assert.equal(
        await operations.computeVaultKeyMigratedVault(
          "master-password",
          {} as CryptoKey,
        ),
        null,
      );
      await migration.migratePrivateKeysToVaultKey(
        "master-password",
        {} as CryptoKey,
      );
      assert.deepEqual(chromeHarness.writes, []);
      assert.deepEqual(chromeHarness.stores.local.pkVault, duplicate);
    });

    await t.test("new mutation IDs are bounded before encryption or persistence", async () => {
      resetVault({ version: 1, entries: [] });
      await assert.rejects(
        operations.addKeyToVault(
          "x".repeat(codec.MAX_VAULT_ENTRY_ID_LENGTH + 1),
          `0x${"22".repeat(32)}`,
          "master-password",
        ),
        /account ID is invalid/i,
      );
      await assert.rejects(
        operations.removeKeyFromVault(""),
        /account ID is invalid/i,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });
  } finally {
    chromeHarness.restore();
  }
});
