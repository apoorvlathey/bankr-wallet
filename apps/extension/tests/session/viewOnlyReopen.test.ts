import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("view-only-only wallets remain unlocked across every auth mode and reopen", async () => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const authModule = await import("../../src/chrome/authHandlers");
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkeyModule = await import("../../src/chrome/passkeyUnlock");
    const passkeyCrypto = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const sessionModule = await import("../../src/chrome/sessionCache");

    const masterPassword = "master-password";
    const agentPassword = "agent-password";
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    chromeHarness.stores.local.accounts = [
      {
        id: "view-only-account",
        type: "impersonator",
        address: "0x1111111111111111111111111111111111111111",
        createdAt: 1,
      },
    ];
    chromeHarness.stores.local.encryptedVaultKeyMaster =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, masterPassword);
    chromeHarness.stores.local.encryptedVaultKeyAgent =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, agentPassword);
    chromeHarness.stores.local.agentPasswordEnabled = true;
    sessionModule.updateCachedAutoLockTimeout(0);

    const assertPasswordReopen = async (
      password: string,
      expectedType: "master" | "agent",
    ) => {
      await sessionModule.clearAllAuthState();
      const unlocked = await authModule.handleUnlockWallet(password);
      assert.deepEqual(unlocked, {
        success: true,
        passwordType: expectedType,
      });
      assert.equal(sessionModule.getCachedApiKey(), null);
      assert.equal(sessionModule.getCachedVault(), null);
      assert.equal(sessionModule.isWalletUnlocked(), true);

      // A renderer reopen reuses the coherent worker generation.
      assert.equal(sessionModule.isWalletUnlocked(), true);

      // A worker restart clears memory and restores the Never envelope.
      sessionModule.clearInMemoryAuthCache();
      assert.equal(sessionModule.isWalletUnlocked(), false);
      assert.equal(
        await sessionModule.tryRestoreSession(authModule.handleUnlockWallet),
        true,
      );
      assert.equal(sessionModule.getPasswordType(), expectedType);
      assert.equal(sessionModule.isWalletUnlocked(), true);
    };

    await assertPasswordReopen(masterPassword, "master");
    await assertPasswordReopen(agentPassword, "agent");

    await sessionModule.clearAllAuthState();
    const payload = {
      credentialId: Buffer.alloc(64, 0x41).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x42).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x43).toString("base64url"),
      authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
    };
    const built = await passkeyCrypto.buildPasskeyRecord(
      payload,
      vaultKeyBytes,
    );
    assert.equal(built.success, true);
    assert.ok(built.record);
    chromeHarness.stores.local.passkeyUnlock = built.record;

    const passkeyResult = await passkeyModule.handleUnlockWithPasskey(payload);
    assert.equal(passkeyResult.success, true);
    assert.equal(sessionModule.getCachedPassword(), null);
    assert.equal(sessionModule.getCachedApiKey(), null);
    assert.equal(sessionModule.getCachedVault(), null);
    assert.equal(sessionModule.getPasswordType(), "master");
    assert.equal(sessionModule.isWalletUnlocked(), true);
    assert.equal(sessionModule.isWalletUnlocked(), true, "renderer reopen");
  } finally {
    chromeHarness.restore();
  }
});
