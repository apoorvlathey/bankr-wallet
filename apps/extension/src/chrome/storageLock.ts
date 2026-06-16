/**
 * In-process serializer for chrome.storage read-modify-write operations.
 *
 * MV3 runs this extension's storage writers in the service worker, so an
 * in-process promise queue is enough to prevent two async handlers from
 * reading the same old value and clobbering each other's writes.
 */

const locks = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}
