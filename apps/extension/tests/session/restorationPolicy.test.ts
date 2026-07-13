import assert from "node:assert/strict";
import test from "node:test";

import { installNativeSessionStorage } from "./testStorage";

test("legacy Never restoration rehydrates every wallet path and records master type", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    const authTransition = await import("../../src/chrome/authTransition");
    await session.storeSessionAtomic(
      "legacy-never-session",
      true,
      "master",
      "legacy-master-password",
    );
    delete storage.session.passwordType;
    session.clearInMemoryAuthCache();
    const previousAuthEpoch = authTransition.getAuthCeremonyEpoch();
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    const seedKey = `0x${"22".repeat(32)}` as `0x${string}`;

    const restored = await session.tryRestoreSession(async (password) => {
      assert.equal(password, "legacy-master-password");
      session.setCachedApiKey("bankr-credential", password);
      session.setCachedVault([
        { id: "private-account", privateKey },
        { id: "seed-account", privateKey: seedKey },
      ]);
      session.setCachedPasswordType("master");
      return { success: true, passwordType: "master" as const };
    });

    assert.equal(restored, true);
    assert.equal(session.getCachedApiKey(), "bankr-credential");
    assert.equal(session.getPrivateKeyFromCache("private-account"), privateKey);
    assert.equal(session.getPrivateKeyFromCache("seed-account"), seedKey);
    assert.equal(session.getPasswordType(), "master");
    assert.equal(storage.session.passwordType, "master");
    assert.notEqual(authTransition.getAuthCeremonyEpoch(), previousAuthEpoch);
  } finally {
    storage.restore();
  }
});

test("agent Never restoration remains agent after a worker restart", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    await session.storeSessionAtomic(
      "agent-never-session",
      true,
      "agent",
      "agent-password",
    );
    session.clearInMemoryAuthCache();
    const privateKey = `0x${"33".repeat(32)}` as `0x${string}`;

    assert.equal(
      await session.tryRestoreSession(async (password) => {
        assert.equal(password, "agent-password");
        session.setCachedVault([{ id: "private-account", privateKey }]);
        session.setCachedPasswordDirect(password);
        session.setCachedPasswordType("agent");
        return { success: true, passwordType: "agent" as const };
      }),
      true,
    );
    assert.equal(session.getPasswordType(), "agent");
    assert.equal(session.getPrivateKeyFromCache("private-account"), privateKey);
    assert.equal(storage.session.passwordType, "agent");
  } finally {
    storage.restore();
  }
});

test("persisted agent metadata cannot be upgraded to master by unlock", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    await session.storeSessionAtomic(
      "agent-metadata-session",
      true,
      "agent",
      "ambiguous-password",
    );
    session.clearInMemoryAuthCache();

    const restored = await session.tryRestoreSession(async (password) => {
      session.setCachedApiKey("must-be-cleared", password);
      session.setCachedPasswordType("master");
      return { success: true, passwordType: "master" as const };
    });

    assert.equal(restored, false);
    assert.equal(session.getCachedApiKey(), null);
    assert.equal(session.getPasswordType(), null);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);
  } finally {
    storage.restore();
  }
});

test("a timeout change during unlock wins at the post-unlock recheck", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    await session.storeSessionAtomic(
      "racing-timeout-session",
      true,
      "master",
      "master-password",
    );
    session.clearInMemoryAuthCache();

    const restored = await session.tryRestoreSession(async (password) => {
      session.setCachedApiKey("must-be-cleared", password);
      session.setCachedPasswordType("master");
      storage.sync.autoLockTimeout = 300_000;
      return { success: true, passwordType: "master" as const };
    });

    assert.equal(restored, false);
    assert.equal(session.getCachedApiKey(), null);
    assert.equal(session.getPasswordType(), null);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);
    assert.equal(await session.getAutoLockTimeout(), 300_000);
  } finally {
    storage.restore();
  }
});

test("resolvePasswordType accepts biometric master cache without password restoration", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(0);
    session.setCachedVault([]);
    session.setCachedVaultKey({} as CryptoKey);
    session.setCachedPasswordType("master");
    session.setCachedPasswordDirect(null);
    let unlockCalls = 0;

    assert.equal(
      await session.resolvePasswordType(async () => {
        unlockCalls += 1;
        return { success: false };
      }),
      "master",
    );
    assert.equal(unlockCalls, 0);
    assert.equal(session.getCachedPassword(), null);
  } finally {
    storage.restore();
  }
});
