import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return { ...storage };
  if (typeof keys === "string") return { [keys]: storage[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      storage[key] ?? fallback,
    ]),
  );
}

test("manual lock cannot be overtaken by an in-flight session restore", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 0 };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, values);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");

    await sessionModule.storeSessionAtomic(
      "restore-session",
      true,
      "master",
      "correct horse battery staple",
    );
    sessionModule.clearInMemoryAuthCache();

    let releaseUnlock!: () => void;
    let markUnlockStarted!: () => void;
    const unlockGate = new Promise<void>((resolve) => {
      releaseUnlock = resolve;
    });
    const unlockStarted = new Promise<void>((resolve) => {
      markUnlockStarted = resolve;
    });

    const restore = sessionModule.tryRestoreSession(async (password) => {
      assert.equal(password, "correct horse battery staple");
      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("master");
      markUnlockStarted();
      await unlockGate;
      return { success: true, passwordType: "master" as const };
    });

    await unlockStarted;
    let lockFinished = false;
    const lock = transitionModule
      .runSerializedAuthTransition(() => sessionModule.clearAllAuthState())
      .then(() => {
        lockFinished = true;
      });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(lockFinished, false);

    releaseUnlock();
    assert.equal(await restore, true);
    await lock;

    assert.equal(sessionModule.getCachedPassword(), null);
    assert.equal(sessionModule.getPasswordType(), null);
    assert.equal(sessionModule.getCurrentSessionId(), null);
    assert.deepEqual(session, {});
    assert.equal(local.sessionEncKey, undefined);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("session restore rejects a persisted master type that decrypts as agent", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 0 };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const sessionModule = await import("../../src/chrome/sessionCache");
    sessionModule.updateCachedAutoLockTimeout(0);
    await sessionModule.storeSessionAtomic(
      "mismatched-session",
      true,
      "master",
      "agent-password",
    );
    sessionModule.clearInMemoryAuthCache();
    const key = await cryptoModule.importVaultKey(
      cryptoModule.generateVaultKey(),
    );

    const restored = await sessionModule.tryRestoreSession(async (password) => {
      assert.equal(password, "agent-password");
      sessionModule.setCachedPasswordDirect(password);
      sessionModule.setCachedPasswordType("agent");
      sessionModule.setCachedVaultKey(key);
      sessionModule.setCachedMnemonicKey({
        key,
        keyId: "must-be-cleared",
      });
      return { success: true, passwordType: "agent" as const };
    });

    assert.equal(restored, false);
    assert.equal(sessionModule.getPasswordType(), null);
    assert.equal(sessionModule.getCachedVaultKey(), null);
    assert.equal(sessionModule.getCachedMnemonicKey(), null);
    assert.deepEqual(session, {});
    assert.equal(local.sessionEncKey, undefined);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("the restore primitive rejects and clears a stale Never envelope under a timed setting", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 0 };
  const session: StorageRecord = {};
  const storageArea = (storage: StorageRecord) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const sessionModule = await import("../../src/chrome/sessionCache");
    sessionModule.updateCachedAutoLockTimeout(0);
    await sessionModule.storeSessionAtomic(
      "stale-never-session",
      true,
      "master",
      "correct horse battery staple",
    );
    sessionModule.clearInMemoryAuthCache();

    // Simulate a sync change that the in-memory timeout cache has not observed
    // yet, then call the primitive directly as the trusted UI route does.
    sync.autoLockTimeout = 300_000;
    sessionModule.updateCachedAutoLockTimeout(0);
    let unlockCalls = 0;
    const restored = await sessionModule.tryRestoreSession(async () => {
      unlockCalls += 1;
      return { success: true, passwordType: "master" as const };
    });

    assert.equal(restored, false);
    assert.equal(unlockCalls, 0);
    assert.deepEqual(session, {});
    assert.equal(local.sessionEncKey, undefined);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("enabling Never auto-lock cannot recreate a session after manual lock", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 300_000 };
  const session: StorageRecord = {};
  let releaseSyncWrite!: () => void;
  let syncWriteStarted!: () => void;
  const syncWriteGate = new Promise<void>((resolve) => {
    releaseSyncWrite = resolve;
  });
  const syncWriteObserved = new Promise<void>((resolve) => {
    syncWriteStarted = resolve;
  });

  const storageArea = (storage: StorageRecord, gateSet = false) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      if (gateSet && values.autoLockTimeout === 0) {
        syncWriteStarted();
        await syncWriteGate;
      }
      Object.assign(storage, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: storageArea(local),
        sync: storageArea(sync, true),
        session: storageArea(session),
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");
    sessionModule.updateCachedAutoLockTimeout(300_000);
    sessionModule.setCachedApiKey("credential", "master-password");
    sessionModule.setCachedPasswordType("master");

    const enableNever = transitionModule.runSerializedAuthTransition(() =>
      sessionModule.setAutoLockTimeout(0),
    );
    await syncWriteObserved;

    let lockFinished = false;
    const lock = transitionModule
      .runSerializedAuthTransition(() => sessionModule.clearAllAuthState())
      .then(() => {
        lockFinished = true;
      });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(lockFinished, false);

    releaseSyncWrite();
    assert.equal(await enableNever, true);
    await lock;

    assert.deepEqual(session, {});
    assert.equal(local.sessionEncKey, undefined);
    assert.equal(sessionModule.getCachedPassword(), null);
    assert.equal(sessionModule.getPasswordType(), null);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
