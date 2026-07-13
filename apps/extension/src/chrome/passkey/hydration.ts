import { hydrateAuthSessionFromVaultKeyBytes } from "../authHandlers";
import {
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
} from "../authTransition";
import { importVaultKey } from "../crypto";
import {
  loadMnemonicVault,
  verifyMnemonicKeyForVault,
} from "../mnemonicStorage";
import {
  isValidPasskeyCredentialPayload,
  type PasskeyCredentialPayload,
  type PasskeyUnlockRecord,
} from "./record";
import { unwrapPasskeyRecordKeys } from "./keyWrapping";
import {
  loadPasskeyUnlockRecord,
  PASSKEY_UNLOCK_STORAGE_KEY,
} from "./repository";
import { stalePasskeyCeremonyResult } from "./status";
import { clearAllAuthState } from "../sessionCache";

export async function handleUnlockWithPasskey(
  payload: Partial<PasskeyCredentialPayload>,
): Promise<{ success: boolean; error?: string }> {
  if (!isValidPasskeyCredentialPayload(payload)) {
    return { success: false, error: "Invalid passkey unlock payload" };
  }
  if (!isCurrentAuthCeremonyEpoch(payload.authCeremonyEpoch)) {
    return stalePasskeyCeremonyResult();
  }

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

    const unwrapped = await unwrapPasskeyRecordKeys(
      record,
      payload.prfKeyMaterial,
    );
    if (!unwrapped) {
      return { success: false, error: "Biometric unlock failed" };
    }

    let mnemonicKey: { key: CryptoKey; keyId: string } | null = null;
    if (unwrapped.mnemonicKeyBytes && unwrapped.mnemonicKeyId) {
      const mnemonicVault = await loadMnemonicVault();
      if (
        !mnemonicVault ||
        mnemonicVault.version !== 2 ||
        mnemonicVault.keyId !== unwrapped.mnemonicKeyId
      ) {
        return {
          success: false,
          error: "Biometric seed protection does not match this wallet",
        };
      }
      const importedMnemonicKey = await importVaultKey(
        unwrapped.mnemonicKeyBytes,
      );
      if (
        !(await verifyMnemonicKeyForVault(
          mnemonicVault,
          importedMnemonicKey,
        ))
      ) {
        return {
          success: false,
          error:
            "Biometric seed protection could not be verified. Unlock with the master password and upgrade biometric unlock.",
        };
      }
      mnemonicKey = {
        key: importedMnemonicKey,
        keyId: unwrapped.mnemonicKeyId,
      };
    }

    await clearAllAuthState();
    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      unwrapped.vaultKeyBytes,
      "master",
      { password: null, mnemonicKey },
    );
    if (!hydrated.success) {
      await clearAllAuthState();
      return hydrated;
    }
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
    return { success: true };
  } catch (error) {
    await clearAllAuthState().catch(() => undefined);
    console.error("[passkeyUnlock] Failed to unlock with biometrics:", error);
    return { success: false, error: "Biometric unlock failed" };
  }
}
