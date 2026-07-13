// Call-stack-only master mnemonic capability.
import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("master mnemonic access is call-stack-only and preserves wallet-version compatibility", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });

  try {
    const accessModule = await import("../../src/chrome/mnemonic/masterAccess");
    const cryptoModule = await import("../../src/chrome/crypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const mnemonic =
      "test test test test test test test test test test test junk";
    const password = "master-password";

    const reset = () => {
      for (const store of Object.values(chromeHarness.stores)) {
        for (const key of Object.keys(store)) delete store[key];
      }
      chromeHarness.stores.sync.autoLockTimeout = 60_000;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      chromeHarness.clearObservations();
    };

    await t.test("locked and agent sessions fail with stable errors", async () => {
      reset();
      assert.deepEqual(await accessModule.resolveMasterMnemonicAccess(), {
        success: false,
        error: "Wallet must be unlocked",
      });

      sessionModule.setCachedPasswordDirect("agent-password");
      sessionModule.setCachedPasswordType("agent");
      assert.deepEqual(await accessModule.resolveMasterMnemonicAccess(), {
        success: false,
        error: "Seed phrase actions require the master password",
      });
    });

    await t.test("password sessions expose material only to direct property access", async () => {
      reset();
      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("master");

      const result = await accessModule.resolveMasterMnemonicAccess();
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.password, password);
      assert.equal(typeof result.authEpoch, "string");
      assert.deepEqual(Object.keys(result), ["success"]);
      assert.equal(JSON.stringify(result), '{"success":true}');
      assert.deepEqual(structuredClone(result), { success: true });
      assert.equal(Object.isFrozen(result), true);
    });

    await t.test("V2 biometric sessions work without a plaintext password", async () => {
      reset();
      await mnemonicModule.storeMnemonic("group-1", mnemonic, {
        kind: "password",
        password,
      });
      const keyBytes = cryptoModule.generateVaultKey();
      const key = await cryptoModule.importVaultKey(keyBytes);
      const keyId = "mnemonic-key-v2";
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        keyBytes,
        password,
      );
      const v2Vault = await mnemonicModule.prepareMnemonicKeyVault(
        password,
        key,
        keyId,
        masterWrappedKey,
      );
      assert.ok(v2Vault);
      chromeHarness.stores.local.mnemonicVault = v2Vault;
      sessionModule.setCachedPasswordType("master");
      sessionModule.setCachedMnemonicKey({ key, keyId });
      chromeHarness.clearObservations();

      const result = await accessModule.resolveMasterMnemonicAccess();
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.password, null);
      assert.equal(result.mnemonicKey?.keyId, keyId);
      assert.equal(
        await mnemonicModule.getMnemonic("group-1", {
          mnemonicKey: result.mnemonicKey,
        }),
        mnemonic,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("legacy V1 passkeys cannot obtain mnemonic authority", async () => {
      reset();
      await mnemonicModule.storeMnemonic("group-1", mnemonic, {
        kind: "password",
        password,
      });
      const vaultKey = await cryptoModule.importVaultKey(
        cryptoModule.generateVaultKey(),
      );
      sessionModule.setCachedPasswordType("master");
      sessionModule.setCachedVaultKey(vaultKey);
      chromeHarness.clearObservations();

      assert.deepEqual(await accessModule.resolveMasterMnemonicAccess(), {
        success: false,
        error:
          "Unlock with the master password and set up biometric unlock again to use seed phrases.",
      });
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("a V2 vault without its cached key fails closed", async () => {
      reset();
      const keyBytes = cryptoModule.generateVaultKey();
      const key = await cryptoModule.importVaultKey(keyBytes);
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        keyBytes,
        password,
      );
      chromeHarness.stores.local.mnemonicVault =
        await mnemonicModule.prepareMnemonicKeyVault(
          password,
          key,
          "mnemonic-key-v2",
          masterWrappedKey,
        );
      sessionModule.setCachedPasswordType("master");
      chromeHarness.clearObservations();

      assert.deepEqual(await accessModule.resolveMasterMnemonicAccess(), {
        success: false,
        error:
          "Seed phrase protection could not be unlocked. Unlock with the master password and retry biometric setup.",
      });
      assert.deepEqual(chromeHarness.writes, []);
    });
  } finally {
    chromeHarness.restore();
  }
});
