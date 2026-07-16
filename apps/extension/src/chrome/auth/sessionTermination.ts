import {
  blockSessionRestorationForManualLock,
  invalidateAuthCeremonies,
} from "../authTransition";
import { clearAllAuthState } from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

/**
 * Locks the active wallet session in the same linear order as account and
 * recovery-secret mutations. An earlier mutation is allowed to finish before
 * the lock; a queued mutation carries a stale auth epoch and fails closed.
 */
export function terminateActiveAuthSession(
  suppressPasskeyAutoPrompt = false,
): Promise<{ success: true }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    // This worker must not restore a surviving Never envelope after the user
    // has requested a lock, even when both durable-half deletions fail.
    blockSessionRestorationForManualLock();
    invalidateAuthCeremonies();
    try {
      await clearAllAuthState();
    } catch (error) {
      await chrome.runtime
        .sendMessage({
          type: "walletLockFailedExternal",
          suppressPasskeyAutoPrompt: true,
        })
        .catch(() => {});
      throw error;
    }
    chrome.runtime
      .sendMessage({
        type: "walletLockedExternal",
        ...(suppressPasskeyAutoPrompt ? { suppressPasskeyAutoPrompt: true } : {}),
      })
      .catch(() => {});
    return { success: true };
  });
}
