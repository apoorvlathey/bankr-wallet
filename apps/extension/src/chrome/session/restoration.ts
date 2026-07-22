/** Serialized native session restoration and password-type recovery. */
import {
  isSessionRestorationBlockedByManualLock,
  runSerializedAuthTransition,
} from "../authTransition";
import type { PasswordType } from "../types";
import { readStoredAutoLockTimeout, setCachedAutoLockTimeout } from "./autoLockPolicy";
import { getPasswordType, isWalletUnlocked } from "./cacheAccess";
import { restoreLegacySession } from "./legacyRestoration";
import type { UnlockFn } from "./restoredCredential";
import { restoreUnifiedSession } from "./unifiedRestoration";

export {
  isRestoredPasskeySessionCredential,
  isRestoredSessionCapabilityCredential,
  type RestoredPasskeySessionCredential,
  type RestoredSessionCapabilityCredential,
  type UnlockFn,
} from "./restoredCredential";

export async function resolvePasswordType(
  unlockFn: UnlockFn,
  authTransitionAlreadySerialized = false,
): Promise<PasswordType | null> {
  const cached = getPasswordType();
  if (cached !== null) return cached;
  if (authTransitionAlreadySerialized) {
    await tryRestoreSessionAlreadySerialized(unlockFn);
  } else {
    await tryRestoreSession(unlockFn);
  }
  return getPasswordType();
}

async function restoreSessionWithinAuthTransition(
  unlockFn: UnlockFn,
): Promise<boolean> {
  if (isSessionRestorationBlockedByManualLock()) return false;
  const timeout = await readStoredAutoLockTimeout();
  setCachedAutoLockTimeout(timeout);
  if (getPasswordType() !== null && isWalletUnlocked()) return true;
  const unifiedResult = await restoreUnifiedSession(unlockFn, timeout);
  if (unifiedResult !== null) return unifiedResult;
  return restoreLegacySession(unlockFn, timeout);
}

export function tryRestoreSession(unlockFn: UnlockFn): Promise<boolean> {
  return runSerializedAuthTransition(() =>
    restoreSessionWithinAuthTransition(unlockFn),
  );
}

export function tryRestoreSessionAlreadySerialized(
  unlockFn: UnlockFn,
): Promise<boolean> {
  return restoreSessionWithinAuthTransition(unlockFn);
}
