import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import * as memoryCache from "../../src/chrome/session/inMemoryCache";

test("in-memory cache preserves timeout, cross-clear, and timestamp semantics", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    memoryCache.clearInMemoryAuthCache();
    const vaultKey = {} as CryptoKey;
    memoryCache.setCachedApiKey("credential", "master-password");
    memoryCache.setCachedVault([{ id: "account", privateKey: "0x1234" }]);
    memoryCache.setCachedVaultKey(vaultKey);
    memoryCache.setCachedPasswordType("master");
    memoryCache.setCurrentSessionId("session-1");

    now += 999;
    assert.equal(memoryCache.getCachedApiKey(1_000), "credential");
    assert.equal(memoryCache.getPasswordType(1_000), "master");

    now += 2;
    assert.equal(memoryCache.getCachedApiKey(1_000), null);
    assert.equal(
      memoryCache.getCachedVault(1_000),
      null,
      "expiry of one capability clears the whole auth cache",
    );
    assert.equal(memoryCache.getCachedVaultKey(1_000), null);
    assert.equal(memoryCache.getPasswordType(1_000), null);
    assert.equal(memoryCache.getCurrentSessionId(), null);

    memoryCache.setCachedApiKey("never-credential", "never-password");
    now += 10_000_000;
    assert.equal(memoryCache.getCachedApiKey(0), "never-credential");
    assert.equal(memoryCache.getCachedPassword(0), "never-password");

    memoryCache.clearInMemoryAuthCache();
    now = 20_000;
    memoryCache.setCachedApiKey("disconnect-credential", "password");
    memoryCache.setCachedPasswordType("master");
    memoryCache.incrementUIConnections();
    now = 30_000;
    memoryCache.decrementUIConnections();
    now = 30_500;
    assert.equal(memoryCache.getCachedApiKey(1_000), "disconnect-credential");
    assert.equal(memoryCache.getPasswordType(1_000), "master");

    // Direct API-key hydration deliberately keeps the existing credential
    // timestamp rather than extending the session.
    memoryCache.clearInMemoryAuthCache();
    now = 40_000;
    memoryCache.setCachedPasswordDirect("password");
    now = 40_900;
    memoryCache.setCachedApiKeyDirect("direct-credential");
    now = 41_001;
    assert.equal(memoryCache.getCachedApiKey(1_000), null);
  } finally {
    memoryCache.clearInMemoryAuthCache();
    Date.now = originalNow;
  }
});

test("session layers have one-way dependencies and the facade is export-only", async () => {
  const readModule = (name: string) =>
    readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");
  const [
    state,
    autoLock,
    persistence,
    passkeyPersistence,
    cacheAccess,
    teardown,
    timeoutTransitions,
    restoration,
    facade,
  ] = await Promise.all([
    readModule("session/inMemoryCache.ts"),
    readModule("session/autoLockPolicy.ts"),
    readModule("session/persistence.ts"),
    readModule("session/passkeyPersistence.ts"),
    readModule("session/cacheAccess.ts"),
    readModule("session/teardown.ts"),
    readModule("session/timeoutTransitions.ts"),
    readModule("session/restoration.ts"),
    readModule("sessionCache.ts"),
  ]);

  assert.doesNotMatch(state, /chrome\.|from "\.\/(?:persistence|autoLockPolicy)"|from "\.\.\/authTransition"/);
  assert.match(state, /from "\.\.\/types"/);

  assert.doesNotMatch(
    autoLock,
    /from "(?:\.\.\/sessionCache|\.\/inMemoryCache|\.\/persistence|\.\.\/authTransition)"/,
  );
  assert.doesNotMatch(autoLock, /storage\.session|crypto\.subtle/);

  assert.doesNotMatch(
    persistence,
    /from "(?:\.\.\/sessionCache|\.\/inMemoryCache|\.\/autoLockPolicy|\.\.\/(?:authTransition|authHandlers))"/,
  );
  assert.match(persistence, /from "\.\/storage"/);
  assert.match(passkeyPersistence, /from "\.\/persistence"/);
  assert.match(passkeyPersistence, /from "\.\/storage"/);
  assert.doesNotMatch(
    passkeyPersistence,
    /from "(?:\.\.\/sessionCache|\.\/inMemoryCache|\.\/autoLockPolicy|\.\.\/(?:authTransition|authHandlers))"/,
  );

  assert.match(cacheAccess, /from "\.\/autoLockPolicy"/);
  assert.match(cacheAccess, /from "\.\/inMemoryCache"/);
  assert.doesNotMatch(
    cacheAccess,
    /chrome\.|from "\.\/(?:persistence|restoration|teardown|timeoutTransitions)"|from "\.\.\/(?:authTransition|authHandlers)"/,
  );

  assert.match(teardown, /from "\.\/inMemoryCache"/);
  assert.match(teardown, /from "\.\/persistence"/);
  assert.doesNotMatch(
    teardown,
    /from "\.\/(?:autoLockPolicy|cacheAccess|restoration|timeoutTransitions)"|from "\.\.\/(?:authTransition|authHandlers)"/,
  );

  assert.match(timeoutTransitions, /from "\.\.\/authTransition"/);
  assert.match(timeoutTransitions, /from "\.\/autoLockPolicy"/);
  assert.match(timeoutTransitions, /from "\.\/inMemoryCache"/);
  assert.match(timeoutTransitions, /from "\.\/teardown"/);

  assert.match(restoration, /from "\.\.\/authTransition"/);
  assert.match(restoration, /from "\.\/autoLockPolicy"/);
  assert.match(restoration, /from "\.\/cacheAccess"/);
  assert.match(restoration, /from "\.\/inMemoryCache"/);
  assert.match(restoration, /from "\.\/persistence"/);
  assert.match(restoration, /from "\.\/passkeyPersistence"/);
  assert.match(restoration, /from "\.\/teardown"/);
  assert.doesNotMatch(timeoutTransitions, /authHandlers|sessionCache|restoration/);
  assert.doesNotMatch(restoration, /authHandlers|sessionCache|timeoutTransitions/);

  for (const dependency of [
    "session/autoLockPolicy",
    "session/cacheAccess",
    "session/inMemoryCache",
    "session/passkeyPersistence",
    "session/persistence",
    "session/restoration",
    "session/teardown",
    "session/timeoutTransitions",
  ]) {
    assert.match(facade, new RegExp(`from "\\./${dependency}"`));
  }
  assert.doesNotMatch(
    facade,
    /\b(?:import|function|async function|chrome\.|crypto\.|console\.)\b/,
    "the compatibility facade must contain exports only",
  );
  assert.ok(facade.split("\n").length <= 65);

  const chromeDirectory = new URL("../../src/chrome/", import.meta.url);
  const chromeModules = (await readdir(chromeDirectory)).filter((name) =>
    name.endsWith(".ts"),
  );
  for (const name of chromeModules) {
    if (name === "sessionCache.ts") continue;
    const source = await readModule(name);
    assert.doesNotMatch(
      source,
      /from "\.\/session\/(?:inMemoryCache|autoLockPolicy|cacheAccess|passkeyPersistence|persistence|restoration|storage|teardown|timeoutTransitions)"/,
      `${name} must use the stable sessionCache facade`,
    );
  }
});

test("sessionCache preserves its public runtime API through delegation", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = { autoLockTimeout: 900_000 };
  const session: Record<string, unknown> = {};
  const storageArea = (state: Record<string, unknown>) => ({
    get(
      keys?: string | string[] | Record<string, unknown> | null,
      callback?: (items: Record<string, unknown>) => void,
    ) {
      const names =
        keys == null
          ? Object.keys(state)
          : typeof keys === "string"
            ? [keys]
            : Array.isArray(keys)
              ? keys
              : Object.keys(keys);
      const result = Object.fromEntries(names.map((key) => [key, state[key]]));
      if (callback) {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },
    async set(values: Record<string, unknown>) {
      Object.assign(state, structuredClone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        delete state[key];
      }
    },
    async clear() {
      for (const key of Object.keys(state)) delete state[key];
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
    const [facade, persistence, passkeyPersistence] = await Promise.all([
      import("../../src/chrome/sessionCache"),
      import("../../src/chrome/session/persistence"),
      import("../../src/chrome/session/passkeyPersistence"),
    ]);
    const expectedFunctions = [
      "clearAllAuthState",
      "clearInMemoryAuthCache",
      "clearSessionStorage",
      "decrementUIConnections",
      "getAutoLockTimeout",
      "getCachedApiKey",
      "getCachedMnemonicKey",
      "getCachedPassword",
      "getCachedVault",
      "getCachedVaultKey",
      "getCurrentSessionId",
      "getPasswordType",
      "getPrivateKeyFromCache",
      "getSessionPassword",
      "handleAutoLockTimeoutStorageChange",
      "incrementUIConnections",
      "initializeAutoLockTimeoutDefault",
      "isApiKeyCached",
      "isWalletUnlocked",
      "resolvePasswordType",
      "revokePersistedSessionRecoveryKey",
      "setAutoLockTimeout",
      "setCachedApiKey",
      "setCachedApiKeyDirect",
      "setCachedMnemonicKey",
      "setCachedPasswordDirect",
      "setCachedPasswordType",
      "setCachedVault",
      "setCachedVaultKey",
      "setCurrentSessionId",
      "storePasskeySessionAtomic",
      "storeSessionAtomic",
      "tryRestoreSession",
      "tryRestoreSessionAlreadySerialized",
      "updateCachedAutoLockTimeout",
    ];

    for (const name of expectedFunctions) {
      assert.equal(typeof facade[name], "function", name);
    }
    assert.equal(facade.DEFAULT_AUTO_LOCK_TIMEOUT, 900_000);
    assert.equal(facade.AUTO_LOCK_STORAGE_KEY, "autoLockTimeout");
    assert.equal(facade.VALID_AUTO_LOCK_TIMEOUTS.has(0), true);
    assert.equal(
      facade.storePasskeySessionAtomic,
      passkeyPersistence.storePasskeySessionAtomic,
      "passkey persistence remains a direct compatibility re-export",
    );
    assert.equal(
      facade.storeSessionAtomic,
      persistence.storeSessionAtomic,
      "persistence remains a direct compatibility re-export",
    );
    assert.equal(
      facade.revokePersistedSessionRecoveryKey,
      persistence.revokePersistedSessionRecoveryKey,
      "session recovery-half revocation remains a direct compatibility re-export",
    );
    assert.equal(
      facade.setCachedVault,
      memoryCache.setCachedVault,
      "cache setters remain direct compatibility re-exports",
    );
  } finally {
    memoryCache.clearInMemoryAuthCache();
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
