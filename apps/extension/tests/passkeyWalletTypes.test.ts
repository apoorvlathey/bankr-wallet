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

test("passkey hydration populates Bankr, private-key, and seed signing caches", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
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
    const cryptoModule = await import("../src/chrome/crypto");
    const vaultModule = await import("../src/chrome/vaultCrypto");
    const authModule = await import("../src/chrome/authHandlers");
    const sessionModule = await import("../src/chrome/sessionCache");

    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);

    // Bankr accounts hydrate the decrypted API key cache.
    local.encryptedApiKeyVault = await cryptoModule.encryptWithVaultKey(
      vaultKey,
      "bankr-api-key",
    );
    let result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(sessionModule.getCachedApiKey(), "bankr-api-key");
    sessionModule.clearInMemoryAuthCache();

    delete local.encryptedApiKeyVault;
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    local.pkVault = {
      version: 1,
      entries: [
        {
          id: "private-account",
          keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
            privateKey,
            vaultKey,
          ),
        },
      ],
    };
    result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(
      sessionModule.getPrivateKeyFromCache("private-account"),
      privateKey,
    );
    sessionModule.clearInMemoryAuthCache();

    // Seed-phrase accounts sign through their derived key stored in pkVault.
    const seedDerivedKey = `0x${"22".repeat(32)}` as `0x${string}`;
    local.pkVault = {
      version: 1,
      entries: [
        {
          id: "seed-account",
          keystore: await vaultModule.encryptPrivateKeyWithVaultKey(
            seedDerivedKey,
            vaultKey,
          ),
        },
      ],
    };
    result = await authModule.hydrateAuthSessionFromVaultKeyBytes(
      vaultKeyBytes,
      "master",
      { password: null },
    );
    assert.equal(result.success, true);
    assert.equal(
      sessionModule.getPrivateKeyFromCache("seed-account"),
      seedDerivedKey,
    );
    sessionModule.clearInMemoryAuthCache();
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
