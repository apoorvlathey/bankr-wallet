import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";
import { FROZEN_LEGACY_SECRET_FIXTURE } from "../fixtures/legacySecretVaults";

test("frozen legacy secret vaults remain readable without migration writes", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    local: {
      pkVault: structuredClone(FROZEN_LEGACY_SECRET_FIXTURE.pkVault),
      mnemonicVault: structuredClone(
        FROZEN_LEGACY_SECRET_FIXTURE.mnemonicVault,
      ),
    },
  });

  try {
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const vaultModule = await import("../../src/chrome/vaultCrypto");

    await t.test("legacy password-encrypted private keys decrypt exactly", async () => {
      chromeHarness.clearObservations();
      const vault = await vaultModule.loadVault();
      assert.deepEqual(vault, FROZEN_LEGACY_SECRET_FIXTURE.pkVault);
      assert.ok(vault);
      assert.equal(
        await vaultModule.decryptPrivateKey(
          vault.entries[0].keystore,
          FROZEN_LEGACY_SECRET_FIXTURE.password,
        ),
        FROZEN_LEGACY_SECRET_FIXTURE.privateKey,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("V1 mnemonic entries decrypt exactly", async () => {
      chromeHarness.clearObservations();
      assert.deepEqual(
        await mnemonicModule.loadMnemonicVault(),
        FROZEN_LEGACY_SECRET_FIXTURE.mnemonicVault,
      );
      assert.equal(
        await mnemonicModule.getMnemonic(
          FROZEN_LEGACY_SECRET_FIXTURE.seedGroupId,
          { password: FROZEN_LEGACY_SECRET_FIXTURE.password },
        ),
        FROZEN_LEGACY_SECRET_FIXTURE.mnemonic,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("wrong passwords fail closed and preserve ciphertext", async () => {
      chromeHarness.clearObservations();
      const before = chromeHarness.snapshot("local");
      const vault = await vaultModule.loadVault();
      assert.ok(vault);
      await assert.rejects(
        vaultModule.decryptPrivateKey(vault.entries[0].keystore, "wrong-password"),
      );
      assert.equal(
        await mnemonicModule.getMnemonic(
          FROZEN_LEGACY_SECRET_FIXTURE.seedGroupId,
          { password: "wrong-password" },
        ),
        null,
      );
      assert.deepEqual(chromeHarness.snapshot("local"), before);
      assert.deepEqual(chromeHarness.writes, []);
    });
  } finally {
    chromeHarness.restore();
  }
});

