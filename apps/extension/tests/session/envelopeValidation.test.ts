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

test("session password envelopes are exact-sized and allocation bounded", async () => {
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
    await sessionModule.storeSessionAtomic(
      "bounded-session",
      true,
      "master",
      "correct horse battery staple",
    );
    assert.equal(
      await sessionModule.getSessionPassword(),
      "correct horse battery staple",
    );

    const validEncrypted = structuredClone(session.encryptedSessionPassword);
    const validKey = local.sessionEncKey;

    local.sessionEncKey = btoa("short");
    assert.equal(await sessionModule.getSessionPassword(), null);

    local.sessionEncKey = validKey;
    session.encryptedSessionPassword = { data: "AAAA", iv: "AAAA" };
    assert.equal(await sessionModule.getSessionPassword(), null);

    session.encryptedSessionPassword = "not-an-envelope";
    assert.equal(await sessionModule.getSessionPassword(), null);

    session.encryptedSessionPassword = {
      data: "A".repeat(Math.ceil((1024 * 1024 + 17) / 3) * 4),
      iv: (validEncrypted as { iv: string }).iv,
    };
    assert.equal(await sessionModule.getSessionPassword(), null);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
