/**
 * In-process serializer for chrome.storage read-modify-write operations.
 *
 * MV3 runs wallet storage writers in the service worker, so one shared promise
 * queue prevents async handlers from reading the same old value and clobbering
 * each other's whole-record writes.
 */

const locks = new Map<string, Promise<unknown>>();

/** Shared repository lock for account metadata and encrypted wallet secrets. */
export const WALLET_SECRET_STORAGE_LOCK_KEY = "local:wallet-secret-state";

/**
 * Outer workflow lock. It must remain distinct because workflows holding it
 * call repository primitives that acquire WALLET_SECRET_STORAGE_LOCK_KEY.
 */
export const WALLET_SECRET_OPERATION_LOCK_KEY =
  "operation:wallet-secret-state";

export function withStorageLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  locks.set(key, next.catch(() => undefined));
  return next;
}
