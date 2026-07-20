/** Fresh-wallet marker lifecycle. No cryptographic material is created here. */

import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { invalidateAuthCeremonies } from "../authTransition";
import {
  ACTIVE_INITIALIZATION_TTL_MS,
  clearNonAuthoritativeWalletResidue,
  hasAuthoritativeWalletData,
  hasStructurallyCompleteWallet,
  ONBOARDING_INITIALIZATION_KEY,
  ONBOARDING_LOCK_KEY,
  type OnboardingInitializationMarker,
  parseOnboardingInitializationMarker,
  rollbackMarkedInitialization,
} from "./state";

export async function getOnboardingInitializationStatus(
  callerInitializationId?: string,
): Promise<{
  configured: boolean;
  recoveredPartial?: boolean;
  recoveryRequired?: boolean;
  setupInProgress?: boolean;
}> {
  const stored = await chrome.storage.local.get([
    ONBOARDING_INITIALIZATION_KEY,
    "encryptedApiKey",
    "encryptedApiKeyVault",
    "encryptedVaultKeyMaster",
    "encryptedVaultKeyAgent",
    "agentPasswordEnabled",
    "passkeyUnlock",
    "pkVault",
    "mnemonicVault",
    "privacyVault",
    "accounts",
    "seedGroups",
  ]);
  const marker = parseOnboardingInitializationMarker(
    stored[ONBOARDING_INITIALIZATION_KEY],
  );
  const complete = await hasStructurallyCompleteWallet();
  if (marker && complete) {
    await chrome.storage.local
      .remove(ONBOARDING_INITIALIZATION_KEY)
      .catch((error) => {
        console.warn(
          "[onboarding] Wallet is complete but marker cleanup was deferred:",
          error,
        );
      });
    return { configured: true };
  }
  if (marker) {
    const ownedByCaller = marker.id === callerInitializationId;
    const stale =
      Date.now() - marker.startedAt > ACTIVE_INITIALIZATION_TTL_MS;
    if (ownedByCaller || stale) {
      await rollbackOnboardingInitialization(marker.id);
      return { configured: false, recoveredPartial: true };
    }
    return { configured: false, setupInProgress: true };
  }
  if (complete) return { configured: true };

  return {
    configured: false,
    recoveryRequired: hasAuthoritativeWalletData(stored) || undefined,
  };
}

export async function beginOnboardingInitialization(
  requestedInitializationId?: string,
  retirePreviousWalletConnectIdentity?: () => Promise<void>,
  invalidateEphemeralWalletCaches?: () => void,
): Promise<{
  success: boolean;
  initializationId?: string;
  error?: string;
}> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, () =>
    withStorageLock(ONBOARDING_LOCK_KEY, async () => {
      if (await hasStructurallyCompleteWallet()) {
        return { success: false, error: "Wallet is already configured" };
      }
      const existing = await chrome.storage.local.get(null);
      const marker = parseOnboardingInitializationMarker(
        existing[ONBOARDING_INITIALIZATION_KEY],
      );
      if (marker) {
        if (marker.id === requestedInitializationId) {
          return { success: true, initializationId: marker.id };
        }
        return {
          success: false,
          error: "Wallet setup is already in progress in another tab",
        };
      }
      if (hasAuthoritativeWalletData(existing)) {
        return {
          success: false,
          error:
            "Incomplete wallet data was found. Reset the extension before creating a new wallet.",
        };
      }

      invalidateEphemeralWalletCaches?.();
      await clearNonAuthoritativeWalletResidue(existing);
      // WalletConnect identity lives outside chrome.storage and must retire
      // before the replacement wallet's marker or credential can exist.
      await retirePreviousWalletConnectIdentity?.();
      const markerValue: OnboardingInitializationMarker = {
        version: 1,
        id:
          typeof requestedInitializationId === "string" &&
          requestedInitializationId.length > 0 &&
          requestedInitializationId.length <= 128
            ? requestedInitializationId
            : crypto.randomUUID(),
        startedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [ONBOARDING_INITIALIZATION_KEY]: markerValue,
      });
      return { success: true, initializationId: markerValue.id };
    }),
  );
}

export async function completeOnboardingInitialization(
  initializationId: string,
): Promise<{ success: boolean; error?: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, () =>
    withStorageLock(ONBOARDING_LOCK_KEY, async () => {
      const stored = await chrome.storage.local.get(
        ONBOARDING_INITIALIZATION_KEY,
      );
      const marker = parseOnboardingInitializationMarker(
        stored[ONBOARDING_INITIALIZATION_KEY],
      );
      if (!marker || marker.id !== initializationId) {
        return { success: false, error: "Onboarding session is no longer valid" };
      }
      if (!(await hasStructurallyCompleteWallet())) {
        return { success: false, error: "Wallet setup did not complete safely" };
      }
      await chrome.storage.local
        .remove(ONBOARDING_INITIALIZATION_KEY)
        .catch((error) => {
          console.warn(
            "[onboarding] Wallet committed; marker cleanup will retry:",
            error,
          );
        });
      return { success: true };
    }),
  );
}

export async function rollbackOnboardingInitialization(
  initializationId: string,
): Promise<{ success: boolean }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    invalidateAuthCeremonies();
    return { success: await rollbackMarkedInitialization(initializationId) };
  });
}
