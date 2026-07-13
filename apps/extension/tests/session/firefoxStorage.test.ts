import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return structuredClone(storage);
  const names =
    typeof keys === "string"
      ? [keys]
      : Array.isArray(keys)
        ? keys
        : Object.keys(keys);
  return Object.fromEntries(
    names.map((key) => [key, structuredClone(storage[key])]),
  );
}

test("Firefox local-session fallback never persists password recovery material", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {
    // Simulate sensitive fallback artifacts left by an older build.
    __session__encryptedSessionPassword: {
      data: "old-ciphertext",
      iv: "old-iv",
    },
    sessionEncKey: "old-key",
  };
  const sync: StorageRecord = { autoLockTimeout: 0 };
  const startupListeners: Array<() => void> = [];

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
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete storage[key];
      }
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
        // Deliberately no storage.session: this is the Firefox fallback.
      },
      runtime: {
        lastError: undefined,
        onStartup: {
          addListener(listener: () => void) {
            startupListeners.push(listener);
          },
        },
      },
    },
  });

  try {
    const sessionStorageModule = await import("../../src/chrome/session/storage");
    const sessionModule = await import("../../src/chrome/sessionCache");
    assert.equal(sessionStorageModule.hasNativeSessionStorage(), false);

    await sessionModule.storeSessionAtomic(
      "firefox-never-session",
      true,
      "master",
      "must-not-reach-local-storage",
    );

    assert.equal(local.sessionEncKey, undefined);
    assert.equal(local.__session__encryptedSessionPassword, undefined);
    assert.equal(local.__session__sessionId, "firefox-never-session");
    assert.equal(local.__session__passwordType, "master");
    assert.equal(local.__session__autoLockNever, false);
    assert.equal(await sessionModule.getSessionPassword(), null);

    // Re-running the upgrade cleanup in a still-non-native browser must keep
    // the current non-secret fallback metadata now that no password envelope
    // exists.
    await sessionStorageModule.cleanupLegacyLocalSessionFallback(
      "sessionEncKey",
    );
    assert.equal(local.__session__sessionId, "firefox-never-session");
    assert.equal(local.__session__passwordType, "master");

    sessionModule.clearInMemoryAuthCache();
    let unlockCalled = false;
    const restored = await sessionModule.tryRestoreSession(async () => {
      unlockCalled = true;
      return { success: true, passwordType: "master" as const };
    });
    assert.equal(restored, false);
    assert.equal(unlockCalled, false);

    // The non-secret shim still owns normal cleanup on browser startup.
    assert.equal(startupListeners.length > 0, true);
    startupListeners.forEach((listener) => listener());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(
      Object.keys(local).some((key) => key.startsWith("__session__")),
      false,
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
