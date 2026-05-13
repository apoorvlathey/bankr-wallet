/**
 * Cross-browser shim for `chrome.storage.session`.
 *
 * Chrome MV3 provides `chrome.storage.session` — an in-memory area that is
 * automatically cleared when the browser closes. Firefox MV3 does not
 * (Bugzilla 1687778). On Firefox we fall back to `chrome.storage.local` with
 * a `__session__` key prefix, and clear those keys on `runtime.onStartup` to
 * preserve the "cleared on browser restart" guarantee.
 *
 * SECURITY: The session encryption-key half lives in `chrome.storage.local`
 * already (see `sessionCache.ts` SESSION_KEY_LOCAL). On Firefox, the
 * ciphertext half ALSO lives in `storage.local` under `__session__`-prefixed
 * keys; both halves are wiped on browser restart by the onStartup listener
 * registered below. A profile-level attacker with access to a still-running
 * Firefox instance can read both halves — this matches the existing Chrome
 * threat model, where a still-running Chrome with `storage.session`
 * populated is similarly readable.
 */

const PREFIX = "__session__";
const NATIVE = typeof chrome !== "undefined" && typeof chrome.storage?.session !== "undefined";

function prefix(key: string): string {
  return PREFIX + key;
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
    return (await chrome.storage.session.get(arg as any)) as Record<string, T>;
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

// Firefox-only: wipe shimmed session keys on browser restart so the cleared-
// on-restart semantics match Chrome's native storage.session.
if (!NATIVE && typeof chrome !== "undefined" && chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void clearSession();
  });
}
