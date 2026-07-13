import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("factor removal revokes Never-session recovery before commit", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const authModule = await import("../../src/chrome/authHandlers");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const sessionModule = await import("../../src/chrome/sessionCache");

    const masterPassword = "master-password";
    const agentPassword = "agent-password";
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);

    const installFactorState = async () => {
      for (const store of Object.values(chromeHarness.stores)) {
        for (const key of Object.keys(store)) delete store[key];
      }
      chromeHarness.stores.sync.autoLockTimeout = 0;
      chromeHarness.stores.local.accounts = [];
      chromeHarness.stores.local.encryptedVaultKeyMaster =
        await cryptoModule.encryptVaultKey(vaultKeyBytes, masterPassword);
      chromeHarness.stores.local.encryptedVaultKeyAgent =
        await cryptoModule.encryptVaultKey(vaultKeyBytes, agentPassword);
      chromeHarness.stores.local.agentPasswordEnabled = true;
      chromeHarness.stores.local.passkeyUnlock = {
        version: 1,
        sentinel: "configured-factor",
      };

      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(0);
      sessionModule.setCachedVaultKey(vaultKey);
      sessionModule.setCachedPasswordDirect(masterPassword);
      sessionModule.setCachedPasswordType("master");
      await sessionModule.storeSessionAtomic(
        "never-session",
        true,
        "master",
        masterPassword,
      );
      chromeHarness.clearObservations();
    };

    const assertSessionCannotRestore = async () => {
      sessionModule.clearInMemoryAuthCache();
      assert.equal(await sessionModule.getSessionPassword(), null);
      let unlockCalls = 0;
      assert.equal(
        await sessionModule.tryRestoreSession(async () => {
          unlockCalls += 1;
          return { success: true, passwordType: "master" as const };
        }),
        false,
      );
      assert.equal(unlockCalls, 0);
    };

    await t.test("failed passkey precommit revocation preserves the factor", async () => {
      await installFactorState();
      const factorBefore = structuredClone(
        chromeHarness.stores.local.passkeyUnlock,
      );
      chromeHarness.failNext({
        area: "local",
        operation: "remove",
        key: "sessionEncKey",
      });

      const result = await passkeyModule.handleRemovePasskeyUnlock(
        masterPassword,
      );

      assert.equal(result.success, false);
      assert.deepEqual(chromeHarness.stores.local.passkeyUnlock, factorBefore);
      assert.equal(
        await sessionModule.getSessionPassword(),
        masterPassword,
        "the intact factor and failed mutation keep the prior session usable",
      );
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("failed agent precommit revocation preserves the factor", async () => {
      await installFactorState();
      const wrapperBefore = structuredClone(
        chromeHarness.stores.local.encryptedVaultKeyAgent,
      );
      chromeHarness.failNext({
        area: "local",
        operation: "remove",
        key: "sessionEncKey",
      });

      const result = await authModule.handleRemoveAgentPassword(masterPassword);

      assert.equal(result.success, false);
      assert.deepEqual(
        chromeHarness.stores.local.encryptedVaultKeyAgent,
        wrapperBefore,
      );
      assert.equal(chromeHarness.stores.local.agentPasswordEnabled, true);
      assert.equal(await sessionModule.getSessionPassword(), masterPassword);
      assert.deepEqual(chromeHarness.runtimeMessages, []);
    });

    await t.test("passkey commit succeeds if only ciphertext cleanup fails", async () => {
      await installFactorState();
      chromeHarness.failNext({ area: "session", operation: "clear" });

      const result = await passkeyModule.handleRemovePasskeyUnlock(
        masterPassword,
      );

      assert.equal(result.success, true);
      assert.equal(chromeHarness.stores.local.passkeyUnlock, undefined);
      assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
      assert.ok(chromeHarness.stores.session.encryptedSessionPassword);
      assert.equal(sessionModule.getCachedVaultKey(), null);
      assert.equal(sessionModule.getPasswordType(), null);
      await assertSessionCannotRestore();
    });

    for (const cleanupFailure of [
      "recovery-key-second-remove",
      "session-clear",
      "combined",
    ] as const) {
      await t.test(
        `agent commit remains terminal after ${cleanupFailure} cleanup failure`,
        async () => {
          await installFactorState();
          if (
            cleanupFailure === "recovery-key-second-remove" ||
            cleanupFailure === "combined"
          ) {
            chromeHarness.failNext({
              area: "local",
              operation: "remove",
              key: "sessionEncKey",
              skipMatches: 1,
            });
          }
          if (
            cleanupFailure === "session-clear" ||
            cleanupFailure === "combined"
          ) {
            chromeHarness.failNext({ area: "session", operation: "clear" });
          }

          const result = await authModule.handleRemoveAgentPassword(
            masterPassword,
          );

          assert.equal(result.success, true);
          assert.equal(
            chromeHarness.stores.local.encryptedVaultKeyAgent,
            null,
          );
          assert.equal(chromeHarness.stores.local.agentPasswordEnabled, false);
          assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
          assert.equal(sessionModule.getCachedVaultKey(), null);
          assert.equal(sessionModule.getPasswordType(), null);
          await assertSessionCannotRestore();
        },
      );
    }

    await t.test(
      "password rotation invalidates an old Never envelope even if teardown fails",
      async () => {
        await installFactorState();
        chromeHarness.failNext({
          area: "local",
          operation: "remove",
          key: "sessionEncKey",
        });
        chromeHarness.failNext({ area: "session", operation: "clear" });

        const result = await authModule.handleChangePassword(
          masterPassword,
          "replacement-master-password",
        );

        assert.equal(result.success, true);
        assert.equal(chromeHarness.stores.local.encryptedVaultKeyAgent, null);
        assert.equal(chromeHarness.stores.local.agentPasswordEnabled, false);
        assert.equal(chromeHarness.stores.local.passkeyUnlock, null);
        assert.equal(
          await sessionModule.getSessionPassword(),
          masterPassword,
          "the injected teardown failure leaves only the old password envelope",
        );
        sessionModule.clearInMemoryAuthCache();
        assert.equal(
          await sessionModule.tryRestoreSession(authModule.handleUnlockWallet),
          false,
          "the rotated master wrapper rejects the old session password",
        );
        assert.equal(sessionModule.isWalletUnlocked(), false);
        assert.deepEqual(chromeHarness.stores.session, {});
        assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
      },
    );
  } finally {
    chromeHarness.restore();
  }
});
