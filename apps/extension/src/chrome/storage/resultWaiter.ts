export type StorageResultTimeoutAttempt = () => Promise<unknown>;

const DEFAULT_TIMEOUT_RETRY_MS = 1_000;
const TIMEOUT_ATTEMPT_MAX_WAIT_MS = 5_000;

/**
 * Wait for a durable provider result without keeping an MV3 message channel
 * open. Ambiguous timeout ownership keeps the listener alive and retries the
 * expiry handshake so a dapp cannot time out while WalletChan may still sign
 * or broadcast the same request.
 */
export function waitForStorageResult<T>(
  key: string,
  timeoutMs = 5 * 60 * 1000,
  onTimeout?: StorageResultTimeoutAttempt,
  timeoutRetryMs = DEFAULT_TIMEOUT_RETRY_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      chrome.storage.onChanged.removeListener(listener);
    };
    const finish = (result: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      void chrome.storage.local.remove(key).catch(() => undefined);
      resolve(result);
    };
    const readDurableResult = async (): Promise<boolean> => {
      try {
        const items = await chrome.storage.local.get(key);
        if (!items[key]?.result) return false;
        finish(items[key].result as T);
        return true;
      } catch {
        return false;
      }
    };
    const scheduleExpiryAttempt = (delayMs: number) => {
      if (settled) return;
      retryTimer = setTimeout(() => void attemptExpiry(), delayMs);
    };
    const attemptExpiry = async () => {
      if (settled || !onTimeout) return;
      await new Promise<void>((done) => {
        const maxWait = setTimeout(done, TIMEOUT_ATTEMPT_MAX_WAIT_MS);
        void Promise.resolve()
          .then(onTimeout)
          .catch(() => undefined)
          .finally(() => {
            clearTimeout(maxWait);
            done();
          });
      });
      if (settled || (await readDurableResult())) return;
      scheduleExpiryAttempt(timeoutRetryMs);
    };

    function listener(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) {
      if (areaName !== "local" || !changes[key]?.newValue?.result) return;
      finish(changes[key].newValue.result as T);
    }

    chrome.storage.onChanged.addListener(listener);
    void readDurableResult();
    timeoutTimer = setTimeout(() => {
      if (!onTimeout) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Request timed out"));
        return;
      }
      void attemptExpiry();
    }, timeoutMs);
  });
}
