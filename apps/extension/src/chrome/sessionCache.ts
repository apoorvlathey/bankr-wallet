/** Export-only compatibility facade for the session audit domain. */
export type {
  CachedMnemonicKey,
  CachedPrivacyKey,
} from "./session/inMemoryCache";
export {
  AUTO_LOCK_STORAGE_KEY,
  DEFAULT_AUTO_LOCK_TIMEOUT,
  VALID_AUTO_LOCK_TIMEOUTS,
  getAutoLockTimeout,
  updateCachedAutoLockTimeout,
} from "./session/autoLockPolicy";
export {
  getCachedApiKey,
  getCachedMnemonicKey,
  getCachedPrivacyKey,
  getCachedPassword,
  getCachedVault,
  getCachedVaultKey,
  getPasswordType,
  getPrivateKeyFromCache,
  isApiKeyCached,
  isWalletUnlocked,
} from "./session/cacheAccess";
export {
  clearInMemoryAuthCache,
  decrementUIConnections,
  getCurrentSessionId,
  incrementUIConnections,
  setCachedApiKey,
  setCachedApiKeyDirect,
  setCachedMnemonicKey,
  setCachedPrivacyKey,
  setCachedPasswordDirect,
  setCachedPasswordType,
  setCachedVault,
  setCachedVaultKey,
  setCurrentSessionId,
} from "./session/inMemoryCache";
export {
  getSessionPassword,
  revokePersistedSessionRecoveryKey,
  storeSessionAtomic,
} from "./session/persistence";
export { storePasskeySessionAtomic } from "./session/passkeyPersistence";
export {
  resolvePasswordType,
  tryRestoreSession,
  tryRestoreSessionAlreadySerialized,
} from "./session/restoration";
export {
  clearAllAuthState,
  clearSessionStorage,
} from "./session/teardown";
export {
  handleAutoLockTimeoutStorageChange,
  initializeAutoLockTimeoutDefault,
  setAutoLockTimeout,
} from "./session/timeoutTransitions";
