import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("critical key integrity boundaries accept compatible wallets and fail closed on corruption", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });

  try {
    const accountModule = await import("../../src/chrome/accountStorage");
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const generalIntegrity = await import(
      "../../src/chrome/vault/generalIntegrity"
    );
    const masterAuthorization = await import(
      "../../src/chrome/masterAuthorization"
    );
    const mnemonicIntegrity = await import("../../src/chrome/mnemonic/integrity");
    const mnemonicStorage = await import("../../src/chrome/mnemonicStorage");
    const privateKeyIntegrity = await import(
      "../../src/chrome/vault/accountIntegrity"
    );
    const seedModule = await import("../../src/chrome/mnemonic/derivation");
    const sessionModule = await import("../../src/chrome/sessionCache");
    const signerModule = await import("../../src/chrome/localSigner");
    const vaultModule = await import("../../src/chrome/vaultCrypto");

    const privateKey = `0x${"31".repeat(32)}` as `0x${string}`;
    const secondPrivateKey = `0x${"32".repeat(32)}` as `0x${string}`;
    const privateAccount = {
      id: "private-account",
      type: "privateKey",
      address: signerModule.deriveAddress(privateKey),
      createdAt: 1,
    };
    const seedAccount = {
      id: "seed-account",
      type: "seedPhrase",
      address: signerModule.deriveAddress(secondPrivateKey),
      seedGroupId: "seed-group",
      derivationIndex: 0,
      createdAt: 2,
    };

    const reset = () => {
      for (const store of Object.values(chromeHarness.stores)) {
        for (const key of Object.keys(store)) delete store[key];
      }
      chromeHarness.stores.sync.autoLockTimeout = 60_000;
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      chromeHarness.clearObservations();
    };

    await t.test("private-key/account binding rejects wrong types, addresses, and orphan cache entries", () => {
      reset();
      assert.equal(
        privateKeyIntegrity.privateKeyMatchesAccount(
          privateAccount as never,
          privateKey,
        ),
        true,
      );
      assert.equal(
        privateKeyIntegrity.privateKeyMatchesAccount(
          { ...privateAccount, address: seedAccount.address } as never,
          privateKey,
        ),
        false,
      );
      assert.equal(
        privateKeyIntegrity.privateKeyMatchesAccount(
          { ...privateAccount, type: "bankr" } as never,
          privateKey,
        ),
        false,
      );
      assert.deepEqual(
        privateKeyIntegrity.retainValidLocalAccountKeys(
          [
            { id: privateAccount.id, privateKey },
            { id: seedAccount.id, privateKey },
            { id: "orphan", privateKey: secondPrivateKey },
          ],
          [privateAccount, seedAccount] as never,
        ),
        [{ id: privateAccount.id, privateKey }],
      );
    });

    await t.test("master authorization requires both a live master type and the exact epoch", () => {
      reset();
      sessionModule.setCachedPasswordType("master");
      const epoch = authTransition.getAuthCeremonyEpoch();
      assert.equal(masterAuthorization.hasCurrentMasterAuthorization(epoch), true);

      authTransition.invalidateAuthCeremonies();
      assert.equal(masterAuthorization.hasCurrentMasterAuthorization(epoch), false);
      assert.throws(
        () => masterAuthorization.assertCurrentMasterAuthorization(epoch),
        new RegExp(masterAuthorization.STALE_MASTER_AUTHORIZATION_ERROR),
      );

      const currentEpoch = authTransition.getAuthCeremonyEpoch();
      sessionModule.setCachedPasswordType("agent");
      assert.equal(
        masterAuthorization.hasCurrentMasterAuthorization(currentEpoch),
        false,
      );
      sessionModule.setCachedPasswordType(null);
      assert.equal(
        masterAuthorization.hasCurrentMasterAuthorization(currentEpoch),
        false,
      );
    });

    await t.test("general recovery proves mixed current and legacy key material without writing secrets", async () => {
      reset();
      const password = "existing-master-password";
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      chromeHarness.stores.local.accounts = [
        { id: "bankr", type: "bankr", address: privateAccount.address, createdAt: 0 },
        privateAccount,
        seedAccount,
      ];
      chromeHarness.stores.local.encryptedApiKeyVault =
        await cryptoModule.encryptWithVaultKey(vaultKey, "test-bankr-key");
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          {
            id: privateAccount.id,
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              privateKey,
              vaultKey,
            ),
          },
          {
            id: seedAccount.id,
            keystore: await vaultModule.encryptPrivateKey(
              secondPrivateKey,
              password,
            ),
          },
        ],
      };
      chromeHarness.clearObservations();

      assert.deepEqual(
        await generalIntegrity.validateGeneralVaultMasterRecovery(
          vaultKeyBytes,
          password,
        ),
        { success: true },
      );
      assert.deepEqual(chromeHarness.writes, []);
      assert.deepEqual(chromeHarness.runtimeMessages, []);
      const serialized = JSON.stringify(chromeHarness.snapshot("local"));
      assert.doesNotMatch(serialized, new RegExp(privateKey.slice(2), "i"));
      assert.doesNotMatch(
        serialized,
        new RegExp(secondPrivateKey.slice(2), "i"),
      );

      chromeHarness.stores.local.accounts = [
        { ...privateAccount, address: seedAccount.address },
        seedAccount,
      ];
      delete chromeHarness.stores.local.encryptedApiKeyVault;
      assert.deepEqual(
        await generalIntegrity.validateGeneralVaultMasterRecovery(
          vaultKeyBytes,
          password,
        ),
        { success: false, error: "A private key does not match its account" },
      );

      chromeHarness.stores.local.accounts = [privateAccount, seedAccount];
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          (chromeHarness.stores.local.pkVault as { entries: unknown[] }).entries[0],
        ],
      };
      assert.deepEqual(
        await generalIntegrity.validateGeneralVaultMasterRecovery(
          vaultKeyBytes,
          password,
        ),
        { success: false, error: "A local account is missing its private key" },
      );
    });

    await t.test("V2 mnemonic recovery verifies its wrapper, phrase, group, and derived account", async () => {
      reset();
      const password = "mnemonic-master-password";
      const mnemonic =
        "test test test test test test test test test test test junk";
      const seedGroupId = "v2-seed-group";
      await mnemonicStorage.storeMnemonic(seedGroupId, mnemonic, {
        kind: "password",
        password,
      });
      const mnemonicKeyBytes = cryptoModule.generateVaultKey();
      const mnemonicKey = await cryptoModule.importVaultKey(mnemonicKeyBytes);
      const keyId = "mnemonic-key-v2";
      const masterWrappedKey = await cryptoModule.encryptVaultKey(
        mnemonicKeyBytes,
        password,
      );
      const v2Vault = await mnemonicStorage.prepareMnemonicKeyVault(
        password,
        mnemonicKey,
        keyId,
        masterWrappedKey,
      );
      assert.ok(v2Vault);
      const validV2Vault = structuredClone(v2Vault);
      chromeHarness.stores.local.mnemonicVault = structuredClone(validV2Vault);
      const derivedPrivateKey = seedModule.derivePrivateKey(mnemonic, 0);
      chromeHarness.stores.local.accounts = [
        {
          id: "v2-seed-account",
          type: "seedPhrase",
          address: signerModule.deriveAddress(derivedPrivateKey),
          seedGroupId,
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      chromeHarness.stores.local.seedGroups = [
        { id: seedGroupId, name: "Recovery", accountCount: 1, createdAt: 1 },
      ];
      chromeHarness.clearObservations();

      assert.deepEqual(
        await mnemonicIntegrity.validateV2MnemonicMasterRecovery(password),
        { success: true },
      );
      assert.deepEqual(chromeHarness.writes, []);
      assert.doesNotMatch(
        JSON.stringify(chromeHarness.snapshot("local")),
        new RegExp(mnemonic.replaceAll(" ", "\\s*"), "i"),
      );

      const wrongKeyBytes = cryptoModule.generateVaultKey();
      (chromeHarness.stores.local.mnemonicVault as { masterWrappedKey: unknown })
        .masterWrappedKey = await cryptoModule.encryptVaultKey(
        wrongKeyBytes,
        password,
      );
      assert.deepEqual(
        await mnemonicIntegrity.validateV2MnemonicMasterRecovery(password),
        { success: false, error: "Seed phrases could not be verified" },
      );

      chromeHarness.stores.local.mnemonicVault = structuredClone(validV2Vault);
      chromeHarness.stores.local.seedGroups = [];
      assert.deepEqual(
        await mnemonicIntegrity.validateV2MnemonicMasterRecovery(password),
        {
          success: false,
          error: "A seed account is missing its recovery phrase",
        },
      );
    });

    await t.test("legacy V1 mnemonic storage remains an accepted upgrade state", async () => {
      reset();
      const password = "legacy-mnemonic-password";
      await mnemonicStorage.storeMnemonic(
        "legacy-seed-group",
        "test test test test test test test test test test test junk",
        { kind: "password", password },
      );
      chromeHarness.clearObservations();

      assert.deepEqual(
        await mnemonicIntegrity.validateV2MnemonicMasterRecovery(password),
        { success: true },
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    // Exercise the account reader used by both recovery validators directly so
    // malformed storage cannot be mistaken for an empty valid wallet fixture.
    assert.ok(Array.isArray(await accountModule.getAccounts()));
  } finally {
    chromeHarness.restore();
  }
});
