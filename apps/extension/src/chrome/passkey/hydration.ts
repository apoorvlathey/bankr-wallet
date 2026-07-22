import { hydrateAuthSessionFromVaultKeyBytes } from "../authHandlers";
import {
  clearManualLockRestorationBlock,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "../authTransition";
import {
  isValidPasskeyCredentialPayload,
  type PasskeyCredentialPayload,
  type PasskeyUnlockRecord,
} from "./record";
import {
  unwrapPasskeyRecordKeys,
  type UnwrappedPasskeyRecordKeys,
} from "./keyWrapping";
import {
  loadPasskeyUnlockRecord,
  PASSKEY_UNLOCK_STORAGE_KEY,
} from "./repository";
import { stalePasskeyCeremonyResult } from "./status";
import {
  clearAllAuthState,
  setCurrentSessionId,
} from "../sessionCache";
import { storeSessionCapabilityAtomic } from "../session/capabilityPersistence";
import { getActiveWalletUiSurfaceIds } from "../session/uiSurfaceLease";
import {
  readStoredAutoLockTimeout,
  setCachedAutoLockTimeout,
} from "../session/autoLockPolicy";
import { unlockPrivacyVaultForPasskeySession } from "../privacy/passkey";
import { preparePasskeyMnemonicKey } from "./mnemonicHydration";

export async function handleUnlockWithPasskey(
  payload: Partial<PasskeyCredentialPayload>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey unlock payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return stalePasskeyCeremonyResult();
  }

  let unwrapped: UnwrappedPasskeyRecordKeys | null = null;
  let privacyKeyBytes: Uint8Array | null = null;
  try {
    const record = await loadPasskeyUnlockRecord();
    if (!record) {
      return { success: false, error: "Biometric unlock is not set up" };
    }
    if (
      payload.credentialId !== record.credentialId ||
      payload.prfSalt !== record.prfSalt
    ) {
      return { success: false, error: "Passkey does not match this wallet" };
    }

    unwrapped = await unwrapPasskeyRecordKeys(
      record,
      payload.prfKeyMaterial,
    );
    if (!unwrapped) {
      return { success: false, error: "Biometric unlock failed" };
    }

    const mnemonic = await preparePasskeyMnemonicKey(unwrapped);
    if (!mnemonic.ok) return { success: false, error: mnemonic.error };
    const mnemonicKey = mnemonic.mnemonicKey;
    let privacyKey: {
      key: CryptoKey;
      keyBytes: Uint8Array;
      keyId: string;
    } | null = null;
    try {
      const preparedPrivacy = await unlockPrivacyVaultForPasskeySession(
        payload.prfKeyMaterial,
      );
      if (preparedPrivacy) {
        privacyKey = {
          key: preparedPrivacy.key,
          keyId: preparedPrivacy.keyId,
          keyBytes: preparedPrivacy.keyBytes,
        };
        privacyKeyBytes = preparedPrivacy.keyBytes;
      }
    } catch (error) {
      // Keep the wallet unlockable if optional Shield state is damaged. The
      // Shield route will surface the fail-closed repair state when opened.
      console.error("Failed to unlock privacy vault with biometrics:", error);
    }

    await clearAllAuthState();
    const autoLockTimeout = await readStoredAutoLockTimeout();
    setCachedAutoLockTimeout(autoLockTimeout);
    const persistedSessionId = crypto.randomUUID();
    await storeSessionCapabilityAtomic({
      sessionId: persistedSessionId,
      unlockMethod: "passkey",
      passwordType: "master",
      vaultKeyBytes: unwrapped.vaultKeyBytes,
      privacyKey: privacyKey
        ? { keyBytes: privacyKey.keyBytes, keyId: privacyKey.keyId }
        : null,
      autoLockTimeout,
      activeSurfaceIds: getActiveWalletUiSurfaceIds(),
    });
    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      unwrapped.vaultKeyBytes,
      "master",
      { password: null, mnemonicKey, privacyKey },
    );
    if (!hydrated.success) {
      await clearAllAuthState();
      return hydrated;
    }
    const currentTimeout = await readStoredAutoLockTimeout();
    setCachedAutoLockTimeout(currentTimeout);
    if (currentTimeout !== autoLockTimeout) {
      await clearAllAuthState();
      return {
        success: false,
        error: "Auto-lock setting changed during biometric unlock",
      };
    }
    setCurrentSessionId(persistedSessionId);
    invalidateAuthCeremonies();

    // Usage metadata is non-essential. Never turn successful hydration into a
    // half-reported unlock because of a quota/transient storage failure.
    await chrome.storage.local
      .set({
        [PASSKEY_UNLOCK_STORAGE_KEY]: {
          ...record,
          lastUsedAt: Date.now(),
        } satisfies PasskeyUnlockRecord,
      })
      .catch((error) => {
        console.warn("[passkeyUnlock] Failed to update last-used time:", error);
      });
    clearManualLockRestorationBlock();
    return { success: true };
  } catch (error) {
    await clearAllAuthState().catch(() => undefined);
    console.error("[passkeyUnlock] Failed to unlock with biometrics:", error);
    return { success: false, error: "Biometric unlock failed" };
  } finally {
    unwrapped?.vaultKeyBytes.fill(0);
    unwrapped?.mnemonicKeyBytes?.fill(0);
    privacyKeyBytes?.fill(0);
  }
}
