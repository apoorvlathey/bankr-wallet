import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("local account key resolution supports legacy and vault-key sessions without leaking unrelated keys", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const resolverModule = await import(
      "../../src/chrome/localAccountKeyResolver"
    );
    const sessionModule = await import("../../src/chrome/sessionCache");
    const signerModule = await import("../../src/chrome/localSigner");
    const vaultModule = await import("../../src/chrome/vaultCrypto");

    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    const otherPrivateKey = `0x${"22".repeat(32)}` as `0x${string}`;
    const accountId = "local-account";
    const account = {
      id: accountId,
      type: "privateKey",
      address: signerModule.deriveAddress(privateKey),
      createdAt: 1,
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

    await t.test("returns an already validated in-memory key without storage mutation", async () => {
      reset();
      sessionModule.setCachedVault([{ id: accountId, privateKey }]);

      assert.equal(
        await resolverModule.getLocalPrivateKeyForAccount(accountId, ""),
        privateKey,
      );
      assert.deepEqual(chromeHarness.writes, []);
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("a biometric-style vault-key session decrypts and caches only the matching account", async () => {
      reset();
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      chromeHarness.stores.local.accounts = [account];
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          {
            id: accountId,
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              privateKey,
              vaultKey,
            ),
          },
          {
            id: "orphan-account",
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              otherPrivateKey,
              vaultKey,
            ),
          },
        ],
      };
      sessionModule.setCachedVaultKey(vaultKey);

      assert.equal(
        await resolverModule.getLocalPrivateKeyForAccount(accountId, ""),
        privateKey,
      );
      assert.equal(
        sessionModule.getPrivateKeyFromCache("orphan-account"),
        null,
        "orphan ciphertext must not become a signing capability",
      );
      assert.doesNotMatch(
        JSON.stringify(chromeHarness.snapshot("local")),
        new RegExp(privateKey.slice(2), "i"),
      );
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("legacy password encryption remains readable for existing users", async () => {
      reset();
      const password = "legacy-wallet-password";
      chromeHarness.stores.local.accounts = [account];
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          {
            id: accountId,
            keystore: await vaultModule.encryptPrivateKey(privateKey, password),
          },
        ],
      };

      assert.equal(
        await resolverModule.getLocalPrivateKeyForAccount(accountId, password),
        privateKey,
      );
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      assert.equal(
        await resolverModule.getLocalPrivateKeyForAccount(
          accountId,
          "wrong-password",
        ),
        null,
      );
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("mismatched account metadata fails closed and never enters the cache", async () => {
      reset();
      const vaultKeyBytes = cryptoModule.generateVaultKey();
      const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
      chromeHarness.stores.local.accounts = [
        { ...account, address: signerModule.deriveAddress(otherPrivateKey) },
      ];
      chromeHarness.stores.local.pkVault = {
        version: 1,
        entries: [
          {
            id: accountId,
            keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
              privateKey,
              vaultKey,
            ),
          },
        ],
      };
      sessionModule.setCachedVaultKey(vaultKey);

      assert.equal(
        await resolverModule.getLocalPrivateKeyForAccount(accountId, ""),
        null,
      );
      assert.equal(sessionModule.getPrivateKeyFromCache(accountId), null);
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });
  } finally {
    chromeHarness.restore();
  }
});
