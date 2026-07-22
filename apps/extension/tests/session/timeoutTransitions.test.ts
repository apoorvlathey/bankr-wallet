import assert from "node:assert/strict";
import test from "node:test";

import { installNativeSessionStorage } from "./testStorage";

test("timeout initialization preserves explicit zero and destroys implicit Never state", async () => {
  const storage = installNativeSessionStorage({
    local: { sessionEncKey: "dormant-key" },
    session: {
      sessionId: "dormant-session",
      autoLockNever: true,
      encryptedSessionPassword: { data: "cipher", iv: "iv" },
    },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(storage.sync.autoLockTimeout, 900_000);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);

    storage.sync.autoLockTimeout = 0;
    storage.local.sessionEncKey = "explicit-never-key";
    storage.session.sessionId = "explicit-never-session";
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(storage.sync.autoLockTimeout, 0);
    assert.equal(storage.local.sessionEncKey, "explicit-never-key");
    assert.equal(storage.session.sessionId, "explicit-never-session");

    storage.sync.autoLockTimeout = "invalid";
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(storage.sync.autoLockTimeout, 900_000);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);
    assert.equal(await session.setAutoLockTimeout(-1), false);
    assert.equal(storage.sync.autoLockTimeout, 900_000);
  } finally {
    storage.restore();
  }
});

test("timed to Never revokes restoration without locking live Bankr, private-key, and seed sessions", async (t) => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 300_000 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    const cases = [
      {
        name: "Bankr master",
        passwordType: "master" as const,
        password: "bankr-password",
        hydrate() {
          session.setCachedApiKey("bankr-credential", "bankr-password");
        },
      },
      {
        name: "private-key master",
        passwordType: "master" as const,
        password: "private-password",
        hydrate() {
          session.setCachedVault([
            {
              id: "private-account",
              privateKey: `0x${"11".repeat(32)}` as `0x${string}`,
            },
          ]);
          session.setCachedPasswordDirect("private-password");
        },
      },
      {
        name: "seed agent",
        passwordType: "agent" as const,
        password: "seed-agent-password",
        hydrate() {
          session.setCachedVault([
            {
              id: "seed-account",
              privateKey: `0x${"22".repeat(32)}` as `0x${string}`,
            },
          ]);
          session.setCachedPasswordDirect("seed-agent-password");
        },
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async () => {
        await session.clearAllAuthState();
        storage.sync.autoLockTimeout = 300_000;
        session.updateCachedAutoLockTimeout(300_000);
        entry.hydrate();
        session.setCachedPasswordType(entry.passwordType);

        assert.equal(await session.setAutoLockTimeout(0), true);
        assert.equal(storage.sync.autoLockTimeout, 0);
        assert.deepEqual(storage.session, {});
        assert.equal(storage.local.sessionEncKey, undefined);
        assert.equal(session.getCachedPassword(), entry.password);
        assert.equal(session.getPasswordType(), entry.passwordType);
        assert.equal(session.getCurrentSessionId(), null);

        assert.equal(await session.setAutoLockTimeout(300_000), true);
        assert.deepEqual(storage.session, {});
        assert.equal(storage.local.sessionEncKey, undefined);
      });
    }
  } finally {
    storage.restore();
  }
});

test("selecting Never cannot synthesize a passkey capability from a non-extractable live key", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 300_000 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(300_000);
    const vaultKey = {} as CryptoKey;
    session.setCachedVault([]);
    session.setCachedVaultKey(vaultKey);
    session.setCachedPasswordType("master");
    session.setCachedPasswordDirect(null);

    assert.equal(await session.setAutoLockTimeout(0), true);
    assert.equal(storage.sync.autoLockTimeout, 0);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);
    assert.equal(session.getPasswordType(), "master");
    assert.equal(session.getCachedVaultKey(), vaultKey);
    assert.equal(session.getCachedPassword(), null);

    session.clearInMemoryAuthCache();
    let unlockCalls = 0;
    assert.equal(
      await session.tryRestoreSession(async () => {
        unlockCalls += 1;
        return { success: true, passwordType: "master" as const };
      }),
      false,
    );
    assert.equal(unlockCalls, 0);
  } finally {
    storage.restore();
  }
});

test("external Never to timed changes clear recovery state through auth serialization", async () => {
  const storage = installNativeSessionStorage({
    sync: { autoLockTimeout: 0 },
  });
  try {
    const session = await import("../../src/chrome/sessionCache");
    await session.storeSessionAtomic(
      "external-change-session",
      true,
      "master",
      "master-password",
    );
    session.setCurrentSessionId("external-change-session");

    await session.handleAutoLockTimeoutStorageChange(0, 300_000);
    assert.deepEqual(storage.session, {});
    assert.equal(storage.local.sessionEncKey, undefined);
    assert.equal(session.getCurrentSessionId(), null);
    assert.equal(await session.getAutoLockTimeout(), 300_000);
  } finally {
    storage.restore();
  }
});
