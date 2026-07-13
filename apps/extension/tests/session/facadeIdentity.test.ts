import assert from "node:assert/strict";
import test from "node:test";

import * as facade from "../../src/chrome/sessionCache";
import * as autoLockPolicy from "../../src/chrome/session/autoLockPolicy";
import * as cacheAccess from "../../src/chrome/session/cacheAccess";
import * as inMemoryCache from "../../src/chrome/session/inMemoryCache";
import * as persistence from "../../src/chrome/session/persistence";
import * as restoration from "../../src/chrome/session/restoration";
import * as teardown from "../../src/chrome/session/teardown";
import * as timeoutTransitions from "../../src/chrome/session/timeoutTransitions";

const owners = {
  AUTO_LOCK_STORAGE_KEY: autoLockPolicy,
  DEFAULT_AUTO_LOCK_TIMEOUT: autoLockPolicy,
  VALID_AUTO_LOCK_TIMEOUTS: autoLockPolicy,
  getAutoLockTimeout: autoLockPolicy,
  updateCachedAutoLockTimeout: autoLockPolicy,
  getCachedApiKey: cacheAccess,
  getCachedMnemonicKey: cacheAccess,
  getCachedPassword: cacheAccess,
  getCachedVault: cacheAccess,
  getCachedVaultKey: cacheAccess,
  getPasswordType: cacheAccess,
  getPrivateKeyFromCache: cacheAccess,
  isApiKeyCached: cacheAccess,
  isWalletUnlocked: cacheAccess,
  clearInMemoryAuthCache: inMemoryCache,
  decrementUIConnections: inMemoryCache,
  getCurrentSessionId: inMemoryCache,
  incrementUIConnections: inMemoryCache,
  setCachedApiKey: inMemoryCache,
  setCachedApiKeyDirect: inMemoryCache,
  setCachedMnemonicKey: inMemoryCache,
  setCachedPasswordDirect: inMemoryCache,
  setCachedPasswordType: inMemoryCache,
  setCachedVault: inMemoryCache,
  setCachedVaultKey: inMemoryCache,
  setCurrentSessionId: inMemoryCache,
  getSessionPassword: persistence,
  revokePersistedSessionRecoveryKey: persistence,
  storeSessionAtomic: persistence,
  resolvePasswordType: restoration,
  tryRestoreSession: restoration,
  tryRestoreSessionAlreadySerialized: restoration,
  clearAllAuthState: teardown,
  clearSessionStorage: teardown,
  handleAutoLockTimeoutStorageChange: timeoutTransitions,
  initializeAutoLockTimeoutDefault: timeoutTransitions,
  setAutoLockTimeout: timeoutTransitions,
} as const;

test("sessionCache preserves the complete public API by runtime identity", () => {
  assert.deepEqual(Object.keys(facade).sort(), Object.keys(owners).sort());
  for (const [name, owner] of Object.entries(owners)) {
    assert.equal(
      facade[name as keyof typeof facade],
      owner[name as keyof typeof owner],
      name,
    );
  }
});
