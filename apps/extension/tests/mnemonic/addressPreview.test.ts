// Secret-free derived-address preview.
import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("seed address preview executes the production derivation boundary", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });

  try {
    const previewModule = await import("../../src/chrome/mnemonic/addressPreview");
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const signerModule = await import("../../src/chrome/localSigner");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const sessionModule = await import("../../src/chrome/sessionCache");

    const mnemonic =
      "test test test test test test test test test test test junk";
    const firstAddress = signerModule.deriveAddress(
      seedModule.derivePrivateKey(mnemonic, 0),
    );
    const secondAddress = signerModule.deriveAddress(
      seedModule.derivePrivateKey(mnemonic, 1),
    );

    const reset = () => {
      for (const store of Object.values(chromeHarness.stores)) {
        for (const key of Object.keys(store)) delete store[key];
      }
      chromeHarness.stores.sync.autoLockTimeout = 60_000;
      chromeHarness.clearObservations();
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
    };

    await t.test("raw phrases work while locked and never persist", async () => {
      reset();
      chromeHarness.stores.local.accounts = [
        {
          id: "signer",
          type: "privateKey",
          address: firstAddress,
          createdAt: 1,
        },
        {
          id: "watch-only",
          type: "impersonator",
          address: secondAddress,
          createdAt: 2,
        },
      ];

      const result = await previewModule.previewSeedAddresses({
        mnemonic,
        start: 0,
        count: 2,
      });
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.deepEqual(
        result.items.map(({ index, address, exists }) => ({
          index,
          address: address.toLowerCase(),
          exists,
        })),
        [
          { index: 0, address: firstAddress.toLowerCase(), exists: true },
          { index: 1, address: secondAddress.toLowerCase(), exists: false },
        ],
      );
      assert.deepEqual(chromeHarness.writes, []);
      assert.equal(JSON.stringify(result).includes(mnemonic), false);
    });

    await t.test("invalid and missing phrases fail without storage effects", async () => {
      reset();
      assert.deepEqual(
        await previewModule.previewSeedAddresses({ mnemonic: "not a phrase" }),
        { success: false, error: "Invalid seed phrase (must be 12 words)" },
      );
      assert.deepEqual(await previewModule.previewSeedAddresses({}), {
        success: false,
        error: "Either mnemonic or seedGroupId is required",
      });
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("preview bounds count and rejects unsafe derivation indices", async () => {
      reset();
      const bounded = await previewModule.previewSeedAddresses({
        mnemonic,
        count: 25,
      });
      assert.equal(bounded.success, true);
      if (bounded.success) assert.equal(bounded.items.length, 20);

      const unsafe = await previewModule.previewSeedAddresses({
        mnemonic,
        start: 0x80000000,
        count: 1,
      });
      assert.equal(unsafe.success, false);
      if (!unsafe.success) {
        assert.match(unsafe.error, /Derivation index must be between/);
      }
    });

    await t.test("stored V1 phrases require a live master session", async () => {
      reset();
      const password = "master-password";
      await mnemonicModule.storeMnemonic("group-1", mnemonic, {
        kind: "password",
        password,
      });
      chromeHarness.clearObservations();

      assert.deepEqual(
        await previewModule.previewSeedAddresses({ seedGroupId: "group-1" }),
        { success: false, error: "Wallet must be unlocked" },
      );

      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("master");
      const unlocked = await previewModule.previewSeedAddresses({
        seedGroupId: "group-1",
        count: 1,
      });
      assert.equal(unlocked.success, true);
      if (unlocked.success) {
        assert.equal(unlocked.items[0].address.toLowerCase(), firstAddress.toLowerCase());
      }
      assert.deepEqual(chromeHarness.writes, []);
      assert.equal(JSON.stringify(unlocked).includes(mnemonic), false);
    });

    await t.test("agent sessions cannot read a stored phrase", async () => {
      reset();
      await mnemonicModule.storeMnemonic("group-1", mnemonic, {
        kind: "password",
        password: "master-password",
      });
      chromeHarness.clearObservations();
      sessionModule.setCachedPasswordDirect("agent-password");
      sessionModule.setCachedPasswordType("agent");

      assert.deepEqual(
        await previewModule.previewSeedAddresses({ seedGroupId: "group-1" }),
        {
          success: false,
          error: "Seed phrase actions require the master password",
        },
      );
      assert.deepEqual(chromeHarness.writes, []);
    });
  } finally {
    chromeHarness.restore();
  }
});
