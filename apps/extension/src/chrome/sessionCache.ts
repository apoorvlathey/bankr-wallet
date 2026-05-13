/**
 * Session cache management for the background service worker
 * Manages all credential caching, session persistence, and auto-lock logic
 *
 * CRITICAL: Private keys and API keys only exist in memory here.
 * They are never stored unencrypted or transmitted outside the service worker.
 */

import type { DecryptedEntry, PasswordType } from "./types";
import {
  getSessionItems,
  setSessionItems,
  clearSession,
} from "./sessionStorage";

// Session cache for decrypted API key and password (cleared on restart/suspend)
let cachedApiKey: string | null = null;
let cachedPassword: string | null = null;
let cacheTimestamp: number = 0;

// Session cache for decrypted vault entries (cleared on restart/suspend)
// CRITICAL: Private keys only exist here in memory, never sent via messages
let cachedVault: DecryptedEntry[] | null = null;
let vaultCacheTimestamp: number = 0;

// Session cache for password type (master or agent)
// Used to restrict certain operations (like private key reveal) for agent sessions
let cachedPasswordType: PasswordType | null = null;

// Session cache for decrypted vault key
// This is the intermediate key that decrypts actual data (API key, private keys)
let cachedVaultKey: CryptoKey | null = null;

// Session ID for tracking active sessions across service worker restarts
// Used with chrome.storage.session for session restoration when auto-lock is "Never"
let currentSessionId: string | null = null;

// UI connection tracking for auto-lock
// While any popup/sidepanel is connected, the cache never expires
let activeUIConnections = 0;

// Auto-lock timeout configuration
export const DEFAULT_AUTO_LOCK_TIMEOUT = 0; // Never (infinite) by default
export const AUTO_LOCK_STORAGE_KEY = "autoLockTimeout";
let cachedAutoLockTimeout: number | null = null;

// Valid auto-lock timeout values (in milliseconds)
export const VALID_AUTO_LOCK_TIMEOUTS = new Set([
  60000,      // 1 minute
  300000,     // 5 minutes
  900000,     // 15 minutes
  1800000,    // 30 minutes
  3600000,    // 1 hour
  14400000,   // 4 hours
  0,          // Never (default)
]);

/**
 * Gets the auto-lock timeout from storage (with caching)
 */
export async function getAutoLockTimeout(): Promise<number> {
  if (cachedAutoLockTimeout !== null) {
    return cachedAutoLockTimeout;
  }
  const result = await chrome.storage.sync.get(AUTO_LOCK_STORAGE_KEY);
  const timeout = result[AUTO_LOCK_STORAGE_KEY] ?? DEFAULT_AUTO_LOCK_TIMEOUT;
  cachedAutoLockTimeout = timeout;
  return timeout;
}

/**
 * Sets the auto-lock timeout in storage
 * Returns false if the timeout value is not in the allowed list
 */
export async function setAutoLockTimeout(timeout: number): Promise<boolean> {
  if (!VALID_AUTO_LOCK_TIMEOUTS.has(timeout)) {
    return false;
  }

  const previousTimeout = cachedAutoLockTimeout ?? DEFAULT_AUTO_LOCK_TIMEOUT;
  await chrome.storage.sync.set({ [AUTO_LOCK_STORAGE_KEY]: timeout });
  cachedAutoLockTimeout = timeout;

  // Handle session storage based on auto-lock setting changes
  if (timeout !== 0 && previousTimeout === 0) {
    // Changed from "Never" to a timed setting - clear session storage
    await clearSessionStorage();
  } else if (timeout === 0 && previousTimeout !== 0 && (getCachedApiKey() !== null || getCachedVault() !== null)) {
    // Changed to "Never" while unlocked - store session for restoration
    const password = getCachedPassword();
    if (password) {
      currentSessionId = crypto.randomUUID();
      await storeSessionMetadata(currentSessionId, true);
      await storeSessionPassword(password);
    }
  }

  return true;
}

/**
 * Updates the cached auto-lock timeout (called from storage change listener)
 */
export function updateCachedAutoLockTimeout(newValue: number | undefined): void {
  cachedAutoLockTimeout = newValue ?? DEFAULT_AUTO_LOCK_TIMEOUT;
}

/**
 * Gets cached API key if still valid
 */
export function getCachedApiKey(): string | null {
  const timeout = cachedAutoLockTimeout ?? DEFAULT_AUTO_LOCK_TIMEOUT;
  // Skip timeout check while UI is open, or if timeout is 0 ("Never")
  if (cachedApiKey && (activeUIConnections > 0 || timeout === 0 || Date.now() - cacheTimestamp < timeout)) {
    return cachedApiKey;
  }
  cachedApiKey = null;
  cachedPassword = null;
  return null;
}

/**
 * Gets cached password if still valid
 */
export function getCachedPassword(): string | null {
  const timeout = cachedAutoLockTimeout ?? DEFAULT_AUTO_LOCK_TIMEOUT;
  // Skip timeout check while UI is open, or if timeout is 0 ("Never")
  if (cachedPassword && (activeUIConnections > 0 || timeout === 0 || Date.now() - cacheTimestamp < timeout)) {
    return cachedPassword;
  }
  cachedPassword = null;
  return null;
}

/**
 * Caches the decrypted API key and password
 */
export function setCachedApiKey(apiKey: string, password?: string): void {
  cachedApiKey = apiKey;
  if (password) {
    cachedPassword = password;
  }
  cacheTimestamp = Date.now();
}

/**
 * Sets the cached API key directly (without updating password/timestamp)
 * Used during unlock flows where password is set separately
 */
export function setCachedApiKeyDirect(apiKey: string): void {
  cachedApiKey = apiKey;
}

/**
 * Sets the cached password directly (without updating API key)
 * Used during unlock flows. Pass null to clear.
 */
export function setCachedPasswordDirect(password: string | null): void {
  cachedPassword = password;
  if (password) {
    cacheTimestamp = Date.now();
  } else {
    cacheTimestamp = 0;
  }
}

/**
 * Clears the cached API key, password, vault key, and password type
 */
export function clearCachedApiKey(): void {
  cachedApiKey = null;
  cachedPassword = null;
  cachedPasswordType = null;
  cachedVaultKey = null;
  cacheTimestamp = 0;
}

/**
 * Gets cached vault if still valid
 */
export function getCachedVault(): DecryptedEntry[] | null {
  const timeout = cachedAutoLockTimeout ?? DEFAULT_AUTO_LOCK_TIMEOUT;
  // Skip timeout check while UI is open, or if timeout is 0 ("Never")
  if (cachedVault && (activeUIConnections > 0 || timeout === 0 || Date.now() - vaultCacheTimestamp < timeout)) {
    return cachedVault;
  }
  cachedVault = null;
  return null;
}

/**
 * Caches the decrypted vault entries
 */
export function setCachedVault(vault: DecryptedEntry[]): void {
  cachedVault = vault;
  vaultCacheTimestamp = Date.now();
}

/**
 * Clears the cached vault
 */
export function clearCachedVault(): void {
  cachedVault = null;
  vaultCacheTimestamp = 0;
}

/**
 * Gets cached vault key
 */
export function getCachedVaultKey(): CryptoKey | null {
  return cachedVaultKey;
}

/**
 * Sets cached vault key. Pass null to clear.
 */
export function setCachedVaultKey(key: CryptoKey | null): void {
  cachedVaultKey = key;
}

/**
 * Gets cached password type
 */
export function getPasswordType(): PasswordType | null {
  return cachedPasswordType;
}

/**
 * Sets cached password type. Pass null to clear.
 */
export function setCachedPasswordType(type: PasswordType | null): void {
  cachedPasswordType = type;
}

/**
 * Returns the currently-cached password type, restoring session from
 * chrome.storage.session if the cache is empty and auto-lock is "Never".
 *
 * SECURITY: Use this instead of getPasswordType() in master-only guards.
 * After an MV3 service worker restart cachedPasswordType is null, so a raw
 * `getPasswordType() === "agent"` check evaluates false and bypasses the
 * guard before later restore logic re-populates the agent type.
 */
export async function resolvePasswordType(
  unlockFn: (password: string) => Promise<{ success: boolean; passwordType?: PasswordType }>
): Promise<PasswordType | null> {
  const cached = getPasswordType();
  if (cached !== null) return cached;

  const timeout = await getAutoLockTimeout();
  if (timeout !== 0) return null;

  await tryRestoreSession(unlockFn);
  return getPasswordType();
}

/**
 * Gets the current session ID
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Sets the current session ID
 */
export function setCurrentSessionId(id: string | null): void {
  currentSessionId = id;
}

// Storage key in chrome.storage.local for the session encryption key half.
// Cleaned up on lock / session clear.
const SESSION_KEY_LOCAL = "sessionEncKey";

/**
 * Stores encrypted session password for session restoration (auto-lock "Never").
 *
 * Security: The password is AES-256-GCM encrypted. The ciphertext + IV are stored
 * in chrome.storage.session (cleared on browser close), while the AES key is stored
 * in chrome.storage.local under a dedicated key. Compromising either storage area
 * alone does not reveal the password.
 */
export async function storeSessionPassword(password: string): Promise<void> {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey("raw", sessionKey, "AES-GCM", false, ["encrypt"]);
  const encoded = new TextEncoder().encode(password);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // Split key material across two storage areas
  await setSessionItems({
    encryptedSessionPassword: {
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
    },
  });
  await chrome.storage.local.set({
    [SESSION_KEY_LOCAL]: btoa(String.fromCharCode(...sessionKey)),
  });
}

/**
 * Retrieves and decrypts the session password.
 * Reads ciphertext from chrome.storage.session and AES key from chrome.storage.local.
 * Returns null if either half is missing or decryption fails.
 */
export async function getSessionPassword(): Promise<string | null> {
  const [session, local] = await Promise.all([
    getSessionItems<{ data: string; iv: string }>("encryptedSessionPassword"),
    chrome.storage.local.get(SESSION_KEY_LOCAL),
  ]);

  if (!session.encryptedSessionPassword || !local[SESSION_KEY_LOCAL]) {
    return null;
  }

  try {
    const { data, iv: ivB64 } = session.encryptedSessionPassword;

    // Decode base64
    const encryptedData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const sessionKey = Uint8Array.from(atob(local[SESSION_KEY_LOCAL]), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey("raw", sessionKey, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedData);

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Stores session metadata in chrome.storage.session.
 * Called after successful unlock when auto-lock is "Never".
 */
export async function storeSessionMetadata(
  sessionId: string,
  autoLockNever: boolean,
  passwordType?: PasswordType
): Promise<void> {
  await setSessionItems({
    sessionId,
    sessionStartedAt: Date.now(),
    autoLockNever,
    passwordType, // Store password type to restore agent password guards after restart
  });
}

/**
 * Clears all session data from chrome.storage.session and the session
 * encryption key from chrome.storage.local.
 * Called when user manually locks or session expires.
 */
export async function clearSessionStorage(): Promise<void> {
  currentSessionId = null;
  await Promise.all([
    clearSession(),
    chrome.storage.local.remove(SESSION_KEY_LOCAL),
  ]);
}

/**
 * Attempts to restore a session after service worker restart.
 * Only works when auto-lock is "Never" and session data exists.
 * Returns true if session was successfully restored.
 *
 * @param unlockFn - The unlock function to call with the stored password
 */
export async function tryRestoreSession(
  unlockFn: (password: string) => Promise<{ success: boolean; passwordType?: PasswordType }>
): Promise<boolean> {
  const session = await getSessionItems<unknown>([
    "sessionId",
    "autoLockNever",
    "encryptedSessionPassword",
    "passwordType",
  ]);

  // Check if we have a valid session to restore
  if (!session.sessionId || !session.autoLockNever || !session.encryptedSessionPassword) {
    return false;
  }

  try {
    // Get the session password
    const password = await getSessionPassword();
    if (!password) {
      await clearSessionStorage();
      return false;
    }

    // Try to unlock with the stored password
    const result = await unlockFn(password);
    if (!result.success) {
      await clearSessionStorage();
      return false;
    }

    // Restore session ID
    currentSessionId = session.sessionId;

    // Restore password type (maintains agent password guards after restart)
    if (session.passwordType) {
      setCachedPasswordType(session.passwordType as PasswordType);
    }

    // Re-store the session password and metadata for future restarts
    await storeSessionPassword(password);
    await storeSessionMetadata(session.sessionId, true, session.passwordType as PasswordType);

    console.log("Session restored successfully after service worker restart");
    return true;
  } catch (error) {
    console.error("Failed to restore session:", error);
    await clearSessionStorage();
    return false;
  }
}

/**
 * Gets a private key from the cached vault
 */
export function getPrivateKeyFromCache(accountId: string): `0x${string}` | null {
  const vault = getCachedVault();
  if (!vault) {
    return null;
  }
  const entry = vault.find((e) => e.id === accountId);
  return entry?.privateKey || null;
}

/**
 * Checks if the API key is currently cached (no password needed)
 */
export function isApiKeyCached(): boolean {
  return getCachedApiKey() !== null;
}

/**
 * Checks if the wallet is unlocked (either API key or vault cached)
 */
export function isWalletUnlocked(): boolean {
  return getCachedApiKey() !== null || getCachedVault() !== null;
}

/**
 * Increments active UI connections count
 */
export function incrementUIConnections(): void {
  activeUIConnections++;
}

/**
 * Decrements active UI connections count and resets timestamps when all close
 */
export function decrementUIConnections(): void {
  activeUIConnections--;
  if (activeUIConnections <= 0) {
    activeUIConnections = 0;
    // Reset timestamps so the countdown starts fresh from now
    if (cachedApiKey) {
      cacheTimestamp = Date.now();
    }
    if (cachedVault) {
      vaultCacheTimestamp = Date.now();
    }
  }
}

/**
 * SECURITY: Tear down all in-memory and on-disk auth state. Call this on
 * lock, on master-password change (after verify), and on agent-password
 * removal. The popup must re-route to the unlock screen via a separate
 * broadcast.
 */
export async function clearAllAuthState(): Promise<void> {
  clearCachedApiKey();
  clearCachedVault();
  setCachedVaultKey(null);
  setCachedPasswordDirect(null);
  setCachedPasswordType(null);
  setCurrentSessionId(null);
  await clearSessionStorage();
}

/**
 * Atomic counterpart to storeSessionMetadata + storeSessionPassword.
 * Writes both records in one chrome.storage.session.set so a handler that
 * runs between awaits cannot observe a half-populated session record.
 *
 * Encryption logic mirrors storeSessionPassword exactly — only the write
 * granularity changes.
 */
export async function storeSessionAtomic(
  sessionId: string,
  isUnlocked: boolean,
  passwordType: PasswordType,
  password: string,
): Promise<void> {
  const sessionKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey("raw", sessionKey, "AES-GCM", false, ["encrypt"]);
  const encoded = new TextEncoder().encode(password);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // Single session storage write with both metadata and ciphertext.
  await setSessionItems({
    sessionId,
    sessionStartedAt: Date.now(),
    autoLockNever: isUnlocked,
    passwordType,
    encryptedSessionPassword: {
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
    },
  });
  // The AES key half lives in chrome.storage.local (mirrors storeSessionPassword).
  await chrome.storage.local.set({
    [SESSION_KEY_LOCAL]: btoa(String.fromCharCode(...sessionKey)),
  });
}
