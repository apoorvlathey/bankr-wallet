/**
 * In-process serializer for chrome.storage read-modify-write operations.
 *
 * MV3 runs this extension's storage writers in the service worker, so an
 * in-process promise queue is enough to prevent two async handlers from
 * reading the same old value and clobbering each other's writes.
 */

const locks = new Map<string, Promise<unknown>>();

/**
 * Serializes mutations whose consistency spans account metadata and encrypted
 * signing/recovery material. Keep this shared by accounts, seed groups,
 * pkVault, and mnemonicVault so two extension surfaces cannot interleave
 * whole-object read/modify/write operations and silently drop an entry.
 */
export const WALLET_SECRET_STORAGE_LOCK_KEY = "local:wallet-secret-state";

/**
 * Serializes multi-step account/secret workflows. Those workflows call
 * primitives that acquire WALLET_SECRET_STORAGE_LOCK_KEY, so this must remain
 * a distinct outer lock to avoid re-entrant deadlocks.
 */
export const WALLET_SECRET_OPERATION_LOCK_KEY =
  "operation:wallet-secret-state";

export function withStorageLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}
