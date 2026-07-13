import { invalidateAuthCeremonies } from "../authTransition";
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
    invalidateAuthCeremonies();
    await clearAllAuthState();
    chrome.runtime
      .sendMessage({
        type: "walletLockedExternal",
        ...(suppressPasskeyAutoPrompt ? { suppressPasskeyAutoPrompt: true } : {}),
      })
      .catch(() => {});
    return { success: true };
  });
}
