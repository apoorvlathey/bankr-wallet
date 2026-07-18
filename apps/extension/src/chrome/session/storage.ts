/**
 * Cross-browser shim for `chrome.storage.session`.
 *
 * Supported Chrome and Firefox MV3 versions provide `chrome.storage.session`
 * as an in-memory area that is cleared when the browser closes. Older browsers
 * and forks may not; there we fall back to `chrome.storage.local` with a
 * `__session__` key prefix for non-secret renderer/service-worker state and
 * clear those keys on `runtime.onStartup`.
 *
 * SECURITY: Secret-bearing session restoration is disabled when this fallback
 * is active. Persisting both an encrypted password/general vault capability
 * and its key in local storage would let an offline copy of a closed browser
 * profile recover it before the next onStartup cleanup. The persistence layers
 * keep credentials in memory only on these browsers and proactively remove
 * records written by older builds.
 */

const PREFIX = "__session__";
const NATIVE = typeof chrome !== "undefined" && typeof chrome.storage?.session !== "undefined";
const LEGACY_LOCAL_SESSION_KEYS = [
  "sessionId",
  "sessionStartedAt",
  "autoLockNever",
  "encryptedSessionPassword",
  "encryptedSessionVaultKey",
  "sessionCredentialKind",
  "passwordType",
].map((key) => `${PREFIX}${key}`);

export function hasNativeSessionStorage(): boolean {
  return NATIVE;
}

function prefix(key: string): string {
  return PREFIX + key;
}

/**
 * Remove records written by the old local-storage fallback even after the
 * browser has gained native storage.session support. Without this cross-mode
 * cleanup, an upgraded profile could retain both the old password ciphertext
 * and its local AES-key half indefinitely.
 *
 * A current native Never session also uses `sessionKeyLocal`. Preserve that
 * key when a native password ciphertext exists; the stale prefixed ciphertext
 * is still removed. On a fallback-only profile, or when native session state
 * is absent, the key belonged to the legacy local envelope and is removed.
 */
export async function cleanupLegacyLocalSessionFallback(
  sessionKeyLocal: string,
): Promise<void> {
  const legacyLocal = await chrome.storage.local.get(
    LEGACY_LOCAL_SESSION_KEYS,
  );
  const legacyKeys = Object.keys(legacyLocal).filter(
    (key) => legacyLocal[key] !== undefined,
  );
  if (legacyKeys.length === 0) return;

  const hasLegacySecretCiphertext =
    legacyLocal[prefix("encryptedSessionPassword")] !== undefined ||
    legacyLocal[prefix("encryptedSessionVaultKey")] !== undefined;
  // Current non-native builds still use prefixed local storage for explicitly
  // non-secret session metadata. Preserve that state across event-page/service
  // worker restarts; only a sensitive legacy envelope requires eager cleanup.
  if (!NATIVE && !hasLegacySecretCiphertext) return;

  let hasCurrentNativeSecretCiphertext = false;
  if (NATIVE) {
    const current = await getSessionItems<unknown>(
      ["encryptedSessionPassword", "encryptedSessionVaultKey"],
    );
    hasCurrentNativeSecretCiphertext =
      current.encryptedSessionPassword !== undefined ||
      current.encryptedSessionVaultKey !== undefined;
  }

  const keysToRemove = [...legacyKeys];
  if (
    hasLegacySecretCiphertext &&
    !hasCurrentNativeSecretCiphertext
  ) {
    keysToRemove.push(sessionKeyLocal);
  }
  await chrome.storage.local.remove(keysToRemove);
}

function unprefixKeys<T>(raw: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith(PREFIX)) {
      out[k.slice(PREFIX.length)] = v;
    }
  }
  return out;
}

export async function getSessionItems<T = unknown>(
  keys: string | string[] | null
): Promise<Record<string, T>> {
  if (NATIVE) {
    // `null` reads the entire session storage area.
    const arg = keys === null ? null : keys;
    return new Promise<Record<string, T>>((resolve, reject) => {
      chrome.storage.session.get(arg, (items) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(items);
      });
    });
  }
  if (keys === null) {
    const all = await chrome.storage.local.get(null);
    return unprefixKeys(all as Record<string, T>);
  }
  const list = Array.isArray(keys) ? keys : [keys];
  const prefixed = list.map(prefix);
  const raw = await chrome.storage.local.get(prefixed);
  return unprefixKeys(raw as Record<string, T>);
}

export async function setSessionItems(items: Record<string, unknown>): Promise<void> {
  if (NATIVE) {
    return chrome.storage.session.set(items);
  }
  const prefixed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(items)) {
    prefixed[prefix(k)] = v;
  }
  return chrome.storage.local.set(prefixed);
}

export async function removeSessionItems(keys: string | string[]): Promise<void> {
  if (NATIVE) {
    return chrome.storage.session.remove(keys);
  }
  const list = Array.isArray(keys) ? keys : [keys];
  return chrome.storage.local.remove(list.map(prefix));
}

export async function clearSession(): Promise<void> {
  if (NATIVE) {
    return chrome.storage.session.clear();
  }
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove);
  }
}

// Compatibility fallback: wipe shimmed session keys on browser restart so its
// lifecycle matches native storage.session. Supported Firefox versions use
// the native branch; this path is for older/other browser forks.
if (!NATIVE && typeof chrome !== "undefined" && chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void clearSession();
  });
}
