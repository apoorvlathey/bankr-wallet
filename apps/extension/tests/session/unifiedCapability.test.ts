import assert from "node:assert/strict";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("unified master sessions persist keys, privacy, and authenticated lease metadata without a password", async () => {
  const harness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });
  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const persistence = await import(
      "../../src/chrome/session/capabilityPersistence"
    );
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const privacyKeyBytes = cryptoModule.generateVaultKey();
    harness.stores.local.encryptedVaultKeyMaster =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, "master-password");

    await persistence.storeSessionCapabilityAtomic({
      sessionId: "master-capability",
      unlockMethod: "password",
      passwordType: "master",
      vaultKeyBytes,
      privacyKey: { keyBytes: privacyKeyBytes, keyId: "privacy-key" },
      autoLockTimeout: 60_000,
      activeSurfaceIds: ["surface-a"],
      now: 1_000_000,
    });

    assert.equal(harness.stores.session.encryptedSessionPassword, undefined);
    assert.equal(harness.stores.session.encryptedSessionVaultKey, undefined);
    assert.equal(harness.stores.session.sessionCredentialKind, undefined);
    assert.ok(harness.stores.session.encryptedSessionCapabilities);
    const restored = await persistence.readSessionCapability();
    assert.ok(restored);
    assert.deepEqual(restored.vaultKeyBytes, vaultKeyBytes);
    assert.deepEqual(restored.privacyKeyBytes, privacyKeyBytes);
    assert.equal(restored.passwordType, "master");
    assert.equal(restored.leaseState, "active");
    assert.deepEqual(restored.activeSurfaceIds, ["surface-a"]);
    assert.equal(restored.idleExpiresAt, null);
    restored.vaultKeyBytes.fill(0);
    restored.privacyKeyBytes?.fill(0);

    await persistence.updateSessionCapabilityLease([], 1_010_000);
    const idle = await persistence.readSessionCapability();
    assert.ok(idle);
    assert.equal(idle.leaseState, "idle");
    assert.equal(idle.lastActiveAt, 1_010_000);
    assert.equal(idle.idleExpiresAt, 1_070_000);
    idle.vaultKeyBytes.fill(0);
    idle.privacyKeyBytes?.fill(0);

    const envelope = harness.stores.session.encryptedSessionCapabilities as {
      lastActiveAt: number;
    };
    envelope.lastActiveAt += 1;
    assert.equal(
      await persistence.readSessionCapability(),
      null,
      "lease metadata is authenticated as AES-GCM additional data",
    );
  } finally {
    harness.restore();
  }
});

test("agent sessions persist only the general capability", async () => {
  const harness = createChromeStorageHarness({
    local: { agentPasswordEnabled: true },
    sync: { autoLockTimeout: 0 },
  });
  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const persistence = await import(
      "../../src/chrome/session/capabilityPersistence"
    );
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    harness.stores.local.encryptedVaultKeyAgent =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, "agent-password");
    await persistence.storeSessionCapabilityAtomic({
      sessionId: "agent-capability",
      unlockMethod: "password",
      passwordType: "agent",
      vaultKeyBytes,
      privacyKey: null,
      autoLockTimeout: 0,
      activeSurfaceIds: [],
      now: 2_000_000,
    });
    const restored = await persistence.readSessionCapability();
    assert.ok(restored);
    assert.equal(restored.passwordType, "agent");
    assert.equal(restored.privacyKeyBytes, null);
    assert.equal(restored.privacyKeyId, null);
    restored.vaultKeyBytes.fill(0);
  } finally {
    harness.restore();
  }
});

test("an open UI surface pauses finite in-memory expiry and last close starts it", async () => {
  const harness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });
  const originalNow = Date.now;
  let now = 3_000_000;
  Date.now = () => now;
  try {
    const session = await import("../../src/chrome/sessionCache");
    const lease = await import("../../src/chrome/session/uiSurfaceLease");
    session.clearInMemoryAuthCache();
    session.updateCachedAutoLockTimeout(60_000);
    session.setCachedVaultKey({} as CryptoKey);
    session.setCachedPasswordType("master");

    assert.equal(await lease.registerWalletUiSurface("live-surface"), true);
    now += 10 * 60_000;
    assert.equal(session.isWalletUnlocked(), true);
    await lease.disconnectWalletUiSurface("live-surface");
    now += 59_999;
    assert.equal(session.isWalletUnlocked(), true);
    now += 2;
    assert.equal(session.isWalletUnlocked(), false);
  } finally {
    const session = await import("../../src/chrome/sessionCache");
    session.clearInMemoryAuthCache();
    session.updateCachedAutoLockTimeout(900_000);
    Date.now = originalNow;
    harness.restore();
  }
});

test("a worker restart restores an over-timeout session only for the same continuously open surface", async () => {
  const harness = createChromeStorageHarness({
    sync: { autoLockTimeout: 60_000 },
  });
  const originalNow = Date.now;
  let now = 4_000_000;
  Date.now = () => now;
  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const persistence = await import(
      "../../src/chrome/session/capabilityPersistence"
    );
    const session = await import("../../src/chrome/sessionCache");
    const lease = await import("../../src/chrome/session/uiSurfaceLease");
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    harness.stores.local.encryptedVaultKeyMaster =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, "master-password");
    await persistence.storeSessionCapabilityAtomic({
      sessionId: "continuous-surface-session",
      unlockMethod: "password",
      passwordType: "master",
      vaultKeyBytes,
      privacyKey: null,
      autoLockTimeout: 60_000,
      activeSurfaceIds: ["continuous-surface"],
      now,
    });
    session.clearInMemoryAuthCache();
    session.updateCachedAutoLockTimeout(60_000);
    now += 10 * 60_000;

    assert.equal(
      await lease.registerWalletUiSurface("continuous-surface"),
      true,
    );
    assert.equal(
      await session.tryRestoreSession(async () => {
        session.setCachedVaultKey({} as CryptoKey);
        session.setCachedPasswordType("master");
        return { success: true, passwordType: "master" as const };
      }),
      true,
    );
    assert.equal(session.isWalletUnlocked(), true);
    await lease.disconnectWalletUiSurface("continuous-surface");

    await session.clearAllAuthState();
    now += 1_000;
    await persistence.storeSessionCapabilityAtomic({
      sessionId: "stale-surface-session",
      unlockMethod: "password",
      passwordType: "master",
      vaultKeyBytes,
      privacyKey: null,
      autoLockTimeout: 60_000,
      activeSurfaceIds: ["closed-surface"],
      now,
    });
    session.clearInMemoryAuthCache();
    now += 60_001;
    assert.equal(await lease.registerWalletUiSurface("new-surface"), true);
    let unlockCalls = 0;
    assert.equal(
      await session.tryRestoreSession(async () => {
        unlockCalls += 1;
        return { success: true, passwordType: "master" as const };
      }),
      false,
    );
    assert.equal(unlockCalls, 0);
    await lease.disconnectWalletUiSurface("new-surface");
  } finally {
    const session = await import("../../src/chrome/sessionCache");
    session.clearInMemoryAuthCache();
    session.updateCachedAutoLockTimeout(900_000);
    Date.now = originalNow;
    harness.restore();
  }
});
