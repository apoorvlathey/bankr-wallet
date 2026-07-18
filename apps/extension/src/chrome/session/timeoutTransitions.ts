/** Auto-lock initialization and serialized timed/Never transitions. */

import {
  runSerializedAuthTransition,
} from "../authTransition";
import {
  DEFAULT_AUTO_LOCK_TIMEOUT,
  VALID_AUTO_LOCK_TIMEOUTS,
  isValidAutoLockTimeout,
  normalizeAutoLockTimeout,
  readRawStoredAutoLockTimeout,
  readStoredAutoLockTimeout,
  setCachedAutoLockTimeout,
  writeAutoLockTimeout,
} from "./autoLockPolicy";
import {
  getCachedApiKey,
  getCachedPassword,
  getCachedVault,
  getPasswordType,
} from "./cacheAccess";
import * as memoryCache from "./inMemoryCache";
import { storeSessionAtomic } from "./persistence";
import { clearSessionStorage } from "./teardown";

export async function initializeAutoLockTimeoutDefault(): Promise<void> {
  const value = await readRawStoredAutoLockTimeout();
  if (isValidAutoLockTimeout(value)) return;

  // Missing/invalid settings historically behaved like implicit Never.
  // Destroy both recovery halves before installing the finite default.
  await clearSessionStorage();
  await writeAutoLockTimeout(DEFAULT_AUTO_LOCK_TIMEOUT);
}

export async function setAutoLockTimeout(timeout: number): Promise<boolean> {
  if (!VALID_AUTO_LOCK_TIMEOUTS.has(timeout)) return false;

  // Storage is authoritative: a cold cache must not miss a 0 -> timed change.
  const previousTimeout = await readStoredAutoLockTimeout();
  await writeAutoLockTimeout(timeout);

  // A passkey envelope authenticates the timeout selected at unlock. Revoke
  // every old envelope before applying a different policy so no stale
  // capability can be reinterpreted under the new duration.
  if (timeout !== previousTimeout) {
    await clearSessionStorage();
    memoryCache.setAuthSessionHardExpiry(null);
  }
  if (
    timeout === 0 &&
    previousTimeout !== 0 &&
    (getCachedApiKey() !== null || getCachedVault() !== null)
  ) {
    const password = getCachedPassword();
    const passwordType = getPasswordType();
    if (password && passwordType) {
      const sessionId = crypto.randomUUID();
      memoryCache.setCurrentSessionId(sessionId);
      await storeSessionAtomic(sessionId, true, passwordType, password);
    }
  }

  return true;
}

export async function handleAutoLockTimeoutStorageChange(
  oldValue: unknown,
  newValue: unknown,
): Promise<void> {
  const previousTimeout = normalizeAutoLockTimeout(oldValue);
  const nextTimeout = normalizeAutoLockTimeout(newValue);
  setCachedAutoLockTimeout(nextTimeout);
  if (previousTimeout !== nextTimeout) {
    await runSerializedAuthTransition(async () => {
      await clearSessionStorage();
      memoryCache.setAuthSessionHardExpiry(null);
    });
  }
}
