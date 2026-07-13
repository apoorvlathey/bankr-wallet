// Seed import/derive persistence and compensation.
import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("seed account handlers preserve recovery and signer invariants", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });

  try {
    const accountModule = await import("../../src/chrome/accountStorage");
    const cryptoModule = await import("../../src/chrome/crypto");
    const handlers = await import("../../src/chrome/mnemonic/accountHandlers");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const signerModule = await import("../../src/chrome/localSigner");
    const vaultModule = await import("../../src/chrome/vaultCrypto");

    const mnemonic =
      "test test test test test test test test test test test junk";
    const password = "existing-master-password";

    const reset = () => {
      for (const store of Object.values(chromeHarness.stores)) {
        for (const key of Object.keys(store)) delete store[key];
      }
      chromeHarness.stores.sync.autoLockTimeout = 60_000;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      chromeHarness.clearObservations();
    };

    const unlockPasswordSession = () => {
      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("master");
    };

    await t.test("V1 password wallets add and derive sorted unique accounts", async () => {
      reset();
      unlockPasswordSession();
      const added = await handlers.addSeedPhraseGroup({
        mnemonic,
        indices: [2, 0, 2, 1],
        name: "Legacy recovery",
        accountDisplayName: "First account",
      });
      assert.equal(added.success, true);
      if (!added.success) return;
      assert.deepEqual(
        added.accounts.map(({ derivationIndex }) => derivationIndex),
        [0, 1, 2],
      );
      assert.equal(added.accounts[0].displayName, "First account");
      assert.equal(added.accounts[1].displayName, undefined);
      assert.equal(
        await mnemonicModule.getMnemonic(added.group.id, { password }),
        mnemonic,
      );

      const derived = await handlers.deriveSeedAccounts({
        seedGroupId: added.group.id,
        displayName: "Next account",
      });
      assert.equal(derived.success, true);
      if (!derived.success) return;
      assert.equal(derived.account.derivationIndex, 3);
      assert.equal(derived.account.displayName, "Next account");
      assert.equal((await accountModule.getAccounts()).length, 4);
      assert.equal((await accountModule.getSeedGroups())[0].accountCount, 4);

      const stored = JSON.stringify(chromeHarness.snapshot("local"));
      assert.equal(stored.includes(mnemonic), false);
      for (const index of [0, 1, 2, 3]) {
        assert.doesNotMatch(
          stored,
          new RegExp(seedModule.derivePrivateKey(mnemonic, index).slice(2), "i"),
        );
      }
      assert.equal(
        chromeHarness.runtimeMessages.filter(
          (message) =>
            (message as { type?: string }).type === "accountsUpdated",
        ).length,
        2,
      );
    });

    await t.test("duplicate-only imports leave no orphan group or recovery phrase", async () => {
      reset();
      unlockPasswordSession();
      const privateKey = seedModule.derivePrivateKey(mnemonic, 0);
      chromeHarness.stores.local.accounts = [
        {
          id: "existing-seed",
          type: "seedPhrase",
          address: signerModule.deriveAddress(privateKey),
          seedGroupId: "existing-group",
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      chromeHarness.clearObservations();

      assert.deepEqual(
        await handlers.addSeedPhraseGroup({ mnemonic, indices: [0] }),
        {
          success: false,
          error: "All selected addresses already exist in this wallet",
        },
      );
      assert.equal(chromeHarness.stores.local.seedGroups, undefined);
      assert.equal(chromeHarness.stores.local.mnemonicVault, undefined);
      assert.equal(chromeHarness.stores.local.pkVault, undefined);
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("a view-only address can coexist with its derived signer", async () => {
      reset();
      unlockPasswordSession();
      const address = signerModule.deriveAddress(
        seedModule.derivePrivateKey(mnemonic, 0),
      );
      chromeHarness.stores.local.accounts = [
        {
          id: "watch-only",
          type: "impersonator",
          address,
          createdAt: 1,
        },
      ];

      const result = await handlers.addSeedPhraseGroup({ mnemonic });
      assert.equal(result.success, true);
      if (!result.success) return;
      const accounts = await accountModule.getAccounts();
      assert.equal(accounts.length, 2);
      assert.deepEqual(
        accounts.map(({ type }) => type),
        ["impersonator", "seedPhrase"],
      );
      assert.equal(
        accounts[0].address.toLowerCase(),
        accounts[1].address.toLowerCase(),
      );
    });

    for (const failedKey of ["mnemonicVault", "pkVault", "accounts"] as const) {
      await t.test(`${failedKey} write failure compensates every new recovery artifact`, async () => {
        reset();
        unlockPasswordSession();
        chromeHarness.failNext({
          area: "local",
          operation: "set",
          key: failedKey,
          error: new Error(`simulated ${failedKey} failure`),
        });

        const result = await handlers.addSeedPhraseGroup({
          mnemonic,
          indices: [0],
        });
        assert.equal(result.success, false);
        if (!result.success) assert.match(result.error, /simulated/);
        assert.deepEqual(await accountModule.getAccounts(), []);
        assert.deepEqual(await accountModule.getSeedGroups(), []);
        const mnemonicVault = chromeHarness.stores.local.mnemonicVault as
          | { entries?: unknown[] }
          | undefined;
        assert.deepEqual(mnemonicVault?.entries ?? [], []);
        const pkVault = chromeHarness.stores.local.pkVault as
          | { entries?: unknown[] }
          | undefined;
        assert.deepEqual(pkVault?.entries ?? [], []);
        assert.deepEqual(chromeHarness.runtimeMessages, []);
      });
    }

    await t.test("post-commit count failure never reports a false import failure", async () => {
      reset();
      unlockPasswordSession();
      chromeHarness.failNext({
        area: "local",
        operation: "set",
        key: "seedGroups",
        skipMatches: 1,
        error: new Error("simulated convenience-count failure"),
      });

      const result = await handlers.addSeedPhraseGroup({ mnemonic });
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal((await accountModule.getAccounts()).length, 1);
      assert.equal((await accountModule.getSeedGroups())[0].accountCount, 0);
      assert.equal(
        await mnemonicModule.getMnemonic(result.group.id, { password }),
        mnemonic,
      );
      assert.equal(
        chromeHarness.runtimeMessages.some(
          (message) =>
            (message as { type?: string }).type === "accountsUpdated",
        ),
        true,
      );
    });

    await t.test("a matching private-key account converts in place without duplicating its signer", async () => {
      reset();
      unlockPasswordSession();
      const privateKey = seedModule.derivePrivateKey(mnemonic, 0);
      const existingId = "existing-private-key";
      chromeHarness.stores.local.accounts = [
        {
          id: existingId,
          type: "privateKey",
          address: signerModule.deriveAddress(privateKey),
          displayName: "Preserved name",
          createdAt: 1,
        },
      ];
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          {
            id: existingId,
            keystore: await vaultModule.encryptPrivateKey(privateKey, password),
          },
        ],
      };

      const result = await handlers.addSeedPhraseGroup({ mnemonic });
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.account.id, existingId);
      assert.equal(result.account.displayName, "Preserved name");
      assert.equal(result.account.type, "seedPhrase");
      assert.equal(
        (chromeHarness.stores.local.pkVault as { entries: unknown[] }).entries
          .length,
        1,
      );
    });

    await t.test("V2 biometric sessions add phrases without caching a plaintext password", async () => {
      reset();
      const generalKeyBytes = cryptoModule.generateVaultKey();
      const generalKey = await cryptoModule.importVaultKey(generalKeyBytes);
      const mnemonicKeyBytes = cryptoModule.generateVaultKey();
      const mnemonicKey = await cryptoModule.importVaultKey(mnemonicKeyBytes);
      const keyId = "biometric-mnemonic-key";
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        mnemonicKeyBytes,
        password,
      );
      const v2Vault = await mnemonicModule.prepareMnemonicKeyVault(
        password,
        mnemonicKey,
        keyId,
        masterWrappedKey,
      );
      assert.ok(v2Vault);
      chromeHarness.stores.local.mnemonicVault = v2Vault;
      sessionModule.setCachedPasswordType("master");
      sessionModule.setCachedVaultKey(generalKey);
      sessionModule.setCachedMnemonicKey({ key: mnemonicKey, keyId });
      chromeHarness.clearObservations();

      const result = await handlers.addSeedPhraseGroup({ mnemonic });
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(sessionModule.getCachedPassword(), null);
      assert.equal(
        await mnemonicModule.getMnemonic(result.group.id, {
          mnemonicKey: sessionModule.getCachedMnemonicKey(),
        }),
        mnemonic,
      );
      const pkVault = chromeHarness.stores.local.pkVault as {
        entries: Array<{ keystore: { salt: string } }>;
      };
      assert.equal(pkVault.entries[0].keystore.salt, "");
      assert.equal(JSON.stringify(chromeHarness.snapshot("local")).includes(mnemonic), false);
    });
  } finally {
    chromeHarness.restore();
  }
});
