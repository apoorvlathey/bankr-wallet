import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { Buffer } from "node:buffer";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const PASSWORD = "unified-master-password";
const API_KEY = "unified-bankr-key";
const PRIVATE_KEYS = {
  bankr: `0x${"31".repeat(32)}`,
  privateKey: `0x${"41".repeat(32)}`,
  seedPhrase: `0x${"51".repeat(32)}`,
} as const;

test("password unified sessions restore Bankr, private-key, seed, and Shield capabilities", async (t) => {
  const harness = createChromeStorageHarness({
    sync: { autoLockTimeout: 300_000 },
  });
  try {
    const auth = await import("../../src/chrome/authHandlers");
    const cryptoModule = await import("../../src/chrome/crypto");
    const privacyCrypto = await import("../../src/chrome/privacy/crypto");
    const privacyRecord = await import("../../src/chrome/privacy/record");
    const session = await import("../../src/chrome/sessionCache");
    const signer = await import("../../src/chrome/localSigner");
    const vault = await import("../../src/chrome/vaultCrypto");

    for (const walletType of ["bankr", "privateKey", "seedPhrase"] as const) {
      await t.test(walletType, async () => {
        await session.clearAllAuthState();
        for (const store of Object.values(harness.stores)) {
          for (const key of Object.keys(store)) delete store[key];
        }
        harness.stores.sync.autoLockTimeout = 300_000;
        session.updateCachedAutoLockTimeout(300_000);

        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        harness.stores.local.encryptedVaultKeyMaster =
          await cryptoModule.encryptVaultKey(vaultKeyBytes, PASSWORD);
        const privateKey = PRIVATE_KEYS[walletType];
        const accountId = `${walletType}-account`;
        harness.stores.local.accounts = [{
          id: accountId,
          type: walletType,
          address: privateKeyToAccount(privateKey).address,
          ...(walletType === "seedPhrase"
            ? { seedGroupId: "seed-group", derivationIndex: 0 }
            : {}),
          createdAt: 1,
        }];
        if (walletType === "bankr") {
          harness.stores.local.encryptedApiKeyVault =
            await cryptoModule.encryptWithVaultKey(vaultKey, API_KEY);
        } else {
          harness.stores.local.pkVault = {
            version: 1,
            entries: [{
              id: accountId,
              keystore: await vault.encryptPrivateKeyWithVaultKey(
                privateKey,
                vaultKey,
              ),
            }],
          };
        }

        const privacyKeyBytes = cryptoModule.generateVaultKey();
        const privacyKey = await cryptoModule.importVaultKey(privacyKeyBytes);
        const privacyKeyId = `${walletType}-privacy-key`;
        harness.stores.local.privacyVault = {
          version: 1,
          keyId: privacyKeyId,
          revision: 0,
          createdAt: 1,
          derivation: privacyRecord.PRIVACY_DERIVATION_V1,
          masterWrappedKey: await cryptoModule.encryptVaultKey(
            privacyKeyBytes,
            PASSWORD,
          ),
          keyCheck: await privacyCrypto.createPrivacyKeyCheck(
            privacyKey,
            privacyKeyId,
          ),
          recovery: null,
        };

        assert.deepEqual(await auth.handleUnlockWallet(PASSWORD), {
          success: true,
          passwordType: "master",
        });
        assert.ok(harness.stores.session.encryptedSessionCapabilities);
        assert.equal(harness.stores.session.encryptedSessionPassword, undefined);
        assert.equal(session.getCachedPrivacyKey()?.keyId, privacyKeyId);

        session.clearInMemoryAuthCache();
        assert.equal(
          await session.tryRestoreSession(auth.handleUnlockWallet),
          true,
        );
        assert.equal(session.getCachedPrivacyKey()?.keyId, privacyKeyId);
        if (walletType === "bankr") {
          assert.equal(session.getCachedApiKey(), API_KEY);
        } else {
          const restoredPrivateKey = session.getPrivateKeyFromCache(accountId);
          assert.equal(restoredPrivateKey, privateKey);
          assert.match(
            await signer.signMessage(restoredPrivateKey!, "unified restore"),
            /^0x[0-9a-f]{130}$/i,
          );
        }
        vaultKeyBytes.fill(0);
        privacyKeyBytes.fill(0);
      });
    }
  } finally {
    harness.restore();
  }
});

test("passkey unified sessions restore the verified Shield capability", async () => {
  const harness = createChromeStorageHarness({
    sync: { autoLockTimeout: 300_000 },
  });
  try {
    const auth = await import("../../src/chrome/authHandlers");
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkey = await import("../../src/chrome/passkeyUnlock");
    const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
    const privacyCrypto = await import("../../src/chrome/privacy/crypto");
    const privacyRecord = await import("../../src/chrome/privacy/record");
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(300_000);

    const vaultKeyBytes = cryptoModule.generateVaultKey();
    harness.stores.local.encryptedVaultKeyMaster =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, PASSWORD);
    harness.stores.local.accounts = [{
      id: "view-only",
      type: "impersonator",
      address: "0x1111111111111111111111111111111111111111",
      createdAt: 1,
    }];
    const payload = {
      credentialId: Buffer.alloc(64, 0x61).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x62).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x63).toString("base64url"),
      authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
    };
    const built = await passkeyCrypto.buildPasskeyRecord(payload, vaultKeyBytes);
    assert.ok(built.record);
    harness.stores.local.passkeyUnlock = built.record;

    const privacyKeyBytes = cryptoModule.generateVaultKey();
    const privacyKey = await cryptoModule.importVaultKey(privacyKeyBytes);
    const privacyKeyId = "passkey-privacy-key";
    harness.stores.local.privacyVault = {
      version: 1,
      keyId: privacyKeyId,
      revision: 0,
      createdAt: 1,
      derivation: privacyRecord.PRIVACY_DERIVATION_V1,
      passkeyWrappedKey: await privacyCrypto.wrapPrivacyKeyForPasskey(
        privacyKeyBytes,
        privacyKeyId,
        payload.prfKeyMaterial,
      ),
      keyCheck: await privacyCrypto.createPrivacyKeyCheck(
        privacyKey,
        privacyKeyId,
      ),
      recovery: null,
    };

    assert.deepEqual(await passkey.handleUnlockWithPasskey(payload), {
      success: true,
    });
    assert.equal(session.getCachedPrivacyKey()?.keyId, privacyKeyId);
    session.clearInMemoryAuthCache();
    assert.equal(await session.tryRestoreSession(auth.handleUnlockWallet), true);
    assert.equal(session.getCachedPrivacyKey()?.keyId, privacyKeyId);
    assert.equal(session.getCachedPassword(), null);
    vaultKeyBytes.fill(0);
    privacyKeyBytes.fill(0);
  } finally {
    harness.restore();
  }
});
