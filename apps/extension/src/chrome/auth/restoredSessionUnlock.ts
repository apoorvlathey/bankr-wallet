/** Verification and hydration of decrypted browser-session capabilities. */

import { importVaultKey } from "../crypto";
import { loadPasskeyUnlockRecord } from "../passkey/repository";
import { getPasskeySessionBinding } from "../passkey/sessionBinding";
import { readPrivacyVault } from "../privacy/repository";
import { verifyPrivacyVaultWithKey } from "../privacy/vault";
import { getCurrentSessionFactorBinding } from "../session/capabilityPersistence";
import type {
  RestoredPasskeySessionCredential,
  RestoredSessionCapabilityCredential,
} from "../session/restoration";
import type { PasswordType } from "../types";
import { hydrateAuthSessionFromVaultKeyBytes } from "./sessionHydration";

type RestoredUnlockResult = {
  success: boolean;
  error?: string;
  passwordType?: PasswordType;
};

export async function unlockWithRestoredSessionCapability(
  credential: RestoredSessionCapabilityCredential,
): Promise<RestoredUnlockResult> {
  try {
    const binding = await getCurrentSessionFactorBinding(
      credential.unlockMethod,
      credential.passwordType,
    );
    if (!binding || binding !== credential.factorBinding) {
      return { success: false, error: "Wallet unlock factor changed" };
    }
    if (
      credential.passwordType === "agent" &&
      (credential.privacyKeyBytes || credential.privacyKeyId)
    ) {
      return { success: false, error: "Invalid agent session capability" };
    }

    let privacyKey: {
      key: CryptoKey;
      keyBytes: Uint8Array;
      keyId: string;
    } | null = null;
    if (credential.privacyKeyBytes && credential.privacyKeyId) {
      const stored = await readPrivacyVault();
      if (
        stored.status !== "valid" ||
        stored.record.keyId !== credential.privacyKeyId
      ) {
        return {
          success: false,
          error: "Shield session no longer matches this wallet",
        };
      }
      const key = await importVaultKey(credential.privacyKeyBytes);
      if (!(await verifyPrivacyVaultWithKey(stored.record, key))) {
        return { success: false, error: "Shield session could not be verified" };
      }
      privacyKey = {
        key,
        keyBytes: credential.privacyKeyBytes,
        keyId: credential.privacyKeyId,
      };
    } else if (credential.privacyKeyBytes || credential.privacyKeyId) {
      return { success: false, error: "Invalid Shield session capability" };
    }

    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      credential.vaultKeyBytes,
      credential.passwordType,
      { password: null, privacyKey },
    );
    return hydrated.success
      ? { success: true, passwordType: credential.passwordType }
      : hydrated;
  } catch {
    return { success: false, error: "Wallet session could not be restored" };
  }
}

export async function unlockWithRestoredPasskeySession(
  credential: RestoredPasskeySessionCredential,
): Promise<RestoredUnlockResult> {
  try {
    const record = await loadPasskeyUnlockRecord();
    if (
      !record ||
      (await getPasskeySessionBinding(record)) !== credential.passkeyBinding
    ) {
      return { success: false, error: "Biometric session is no longer valid" };
    }
    const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
      credential.vaultKeyBytes,
      "master",
      { password: null },
    );
    return hydrated.success
      ? { success: true, passwordType: "master" }
      : hydrated;
  } catch {
    return { success: false, error: "Biometric session could not be restored" };
  }
}
