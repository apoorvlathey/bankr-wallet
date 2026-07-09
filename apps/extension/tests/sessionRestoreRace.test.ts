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
    async get(keys?: string | string[] | StorageRecord | null) {
      return selectStorageValues(storage, keys);
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
    },
  });

  try {
    const sessionModule = await import("../src/chrome/sessionCache");
    const transitionModule = await import("../src/chrome/authTransition");

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
