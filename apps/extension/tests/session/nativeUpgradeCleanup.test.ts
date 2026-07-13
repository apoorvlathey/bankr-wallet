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

test("native session upgrades remove only stale Firefox fallback secrets", async (t) => {
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
      runtime: { lastError: undefined },
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    local.__session__encryptedSessionPassword = {
      data: "legacy-ciphertext",
      iv: "legacy-iv",
    };
    local.__session__sessionId = "legacy-session";
    local.sessionEncKey = "legacy-key";
    const sessionModule = await import("../../src/chrome/sessionCache");

    await t.test("stale local fallback ciphertext and key are both removed", async () => {
      // getSessionPassword awaits the startup cleanup barrier.
      assert.equal(await sessionModule.getSessionPassword(), null);

      assert.equal(local.__session__encryptedSessionPassword, undefined);
      assert.equal(local.__session__sessionId, undefined);
      assert.equal(local.sessionEncKey, undefined);
    });

    await t.test("a valid current native Never session remains restorable", async () => {
      await sessionModule.storeSessionAtomic(
        "native-session",
        true,
        "master",
        "current-native-master-password",
      );
      const currentKey = local.sessionEncKey;
      const currentCiphertext = session.encryptedSessionPassword;

      local.__session__encryptedSessionPassword = {
        data: "stale-fallback-ciphertext",
        iv: "stale-fallback-iv",
      };
      local.__session__passwordType = "master";

      const storageModule = await import("../../src/chrome/session/storage");
      await storageModule.cleanupLegacyLocalSessionFallback("sessionEncKey");

      assert.equal(local.__session__encryptedSessionPassword, undefined);
      assert.equal(local.__session__passwordType, undefined);
      assert.equal(local.sessionEncKey, currentKey);
      assert.deepEqual(session.encryptedSessionPassword, currentCiphertext);
      assert.equal(
        await sessionModule.getSessionPassword(),
        "current-native-master-password",
      );
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
