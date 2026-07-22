import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const OLD_PASSWORD = "old-privacy-master";
const NEW_PASSWORD = "new-privacy-master";
const PRF_MATERIAL = Buffer.alloc(32, 9).toString("base64url");

test("privacy recovery survives passkey removal and master-password rotation", async () => {
  const harness = createChromeStorageHarness({
    local: {
      accounts: [
        {
          id: "bankr-account",
          type: "bankr",
          address: `0x${"22".repeat(20)}`,
          createdAt: 1,
        },
      ],
    },
    sync: { activeAccountId: "bankr-account", autoLockTimeout: 60_000 },
  });
  const cryptoModule = await import("../../src/chrome/crypto");
  const identity = await import("../../src/chrome/privacy/identity");
  const privacyCrypto = await import("../../src/chrome/privacy/crypto");
  const repository = await import("../../src/chrome/privacy/repository");
  const privacyVault = await import("../../src/chrome/privacy/vault");
  const session = await import("../../src/chrome/sessionCache");

  session.clearInMemoryAuthCache();
  session.setCachedVaultKey(
    await cryptoModule.importVaultKey(cryptoModule.generateVaultKey()),
  );
  session.setCachedPasswordType("master");
  session.setCachedPasswordDirect(OLD_PASSWORD);

  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
    const initiallyUnlocked = await privacyVault.unlockPrivacyVaultWithPassword(
      OLD_PASSWORD,
    );
    assert.ok(initiallyUnlocked);
    const initialStored = await repository.readPrivacyVault();
    assert.equal(initialStored.status, "valid");
    if (initialStored.status !== "valid") return;
    assert.ok(initialStored.record.recovery);
    const originalPhrase = await privacyCrypto.decryptPrivacyRecovery(
      initiallyUnlocked.key,
      initialStored.record.keyId,
      initialStored.record.recovery,
    );
    assert.ok(originalPhrase);
    initiallyUnlocked.keyBytes.fill(0);

    const passkeySetup = await privacyVault.preparePrivacyVaultForPasskeySetup(
      OLD_PASSWORD,
      PRF_MATERIAL,
    );
    assert.ok(passkeySetup);
    await repository.savePrivacyVault(passkeySetup.record);
    passkeySetup.unlocked.keyBytes.fill(0);
    const passkeyUnlocked = await privacyVault.unlockPrivacyVaultWithPasskey(
      PRF_MATERIAL,
    );
    assert.ok(passkeyUnlocked);
    assert.equal(
      await privacyCrypto.decryptPrivacyRecovery(
        passkeyUnlocked.key,
        passkeySetup.record.keyId,
        passkeySetup.record.recovery!,
      ),
      originalPhrase,
    );
    passkeyUnlocked.keyBytes.fill(0);

    const withoutPasskey = await privacyVault.preparePrivacyVaultForPasskeyRemoval(
      OLD_PASSWORD,
    );
    assert.ok(withoutPasskey);
    if (!withoutPasskey) return;
    assert.equal("passkeyWrappedKey" in withoutPasskey, false);
    await repository.savePrivacyVault(withoutPasskey);
    assert.equal(
      await privacyVault.unlockPrivacyVaultWithPasskey(PRF_MATERIAL),
      null,
    );

    const passkeyReadded = await privacyVault.preparePrivacyVaultForPasskeySetup(
      OLD_PASSWORD,
      PRF_MATERIAL,
    );
    assert.ok(passkeyReadded);
    await repository.savePrivacyVault(passkeyReadded.record);
    passkeyReadded.unlocked.keyBytes.fill(0);

    const rotated = await privacyVault.preparePrivacyVaultForPasswordRotation(
      OLD_PASSWORD,
      NEW_PASSWORD,
    );
    assert.ok(rotated);
    if (!rotated) return;
    assert.equal("passkeyWrappedKey" in rotated, false);
    await repository.savePrivacyVault(rotated);
    assert.equal(
      await privacyVault.unlockPrivacyVaultWithPassword(OLD_PASSWORD),
      null,
    );
    const newUnlocked = await privacyVault.unlockPrivacyVaultWithPassword(
      NEW_PASSWORD,
    );
    assert.ok(newUnlocked);
    assert.equal(
      await privacyCrypto.decryptPrivacyRecovery(
        newUnlocked.key,
        rotated.keyId,
        rotated.recovery!,
      ),
      originalPhrase,
    );
    newUnlocked.keyBytes.fill(0);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("passkey-only compatibility state gains master recovery before factor removal", async () => {
  const harness = createChromeStorageHarness();
  const privacyCrypto = await import("../../src/chrome/privacy/crypto");
  const repository = await import("../../src/chrome/privacy/repository");
  const privacyVault = await import("../../src/chrome/privacy/vault");

  try {
    const prepared = await privacyVault.preparePrivacyVaultForPasskeyUnlock(
      PRF_MATERIAL,
    );
    assert.ok(prepared?.recordToCommit);
    if (!prepared?.recordToCommit) return;
    const phrase = privacyCrypto.generatePrivacyRecoveryPhrase();
    const passkeyOnly = {
      ...prepared.recordToCommit,
      revision: 1,
      recovery: await privacyCrypto.encryptPrivacyRecovery(
        prepared.unlocked.key,
        prepared.recordToCommit.keyId,
        phrase,
      ),
    };
    await repository.savePrivacyVault(passkeyOnly);

    const removed = await privacyVault.preparePrivacyVaultForPasskeyRemoval(
      OLD_PASSWORD,
      prepared.unlocked,
    );
    assert.ok(removed);
    if (!removed) return;
    assert.ok(removed.masterWrappedKey);
    assert.equal("passkeyWrappedKey" in removed, false);
    await repository.savePrivacyVault(removed);

    const unlocked = await privacyVault.unlockPrivacyVaultWithPassword(
      OLD_PASSWORD,
    );
    assert.ok(unlocked);
    assert.equal(
      await privacyCrypto.decryptPrivacyRecovery(
        unlocked.key,
        removed.keyId,
        removed.recovery!,
      ),
      phrase,
    );
    unlocked.keyBytes.fill(0);
    prepared.unlocked.keyBytes.fill(0);
  } finally {
    harness.restore();
  }
});
