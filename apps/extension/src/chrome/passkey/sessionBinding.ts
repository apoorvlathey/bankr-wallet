/** Stable non-secret binding between a passkey record and session capability. */

import { arrayBufferToBase64 } from "../cryptoUtils";
import type { PasskeyUnlockRecord } from "./record";

export async function getPasskeySessionBinding(
  record: PasskeyUnlockRecord,
): Promise<string> {
  const stableRecord =
    record.version === 2
      ? {
          version: record.version,
          rpId: record.rpId,
          credentialId: record.credentialId,
          prfSalt: record.prfSalt,
          wrappedVaultKey: record.wrappedVaultKey,
          wrappedMnemonicKey: record.wrappedMnemonicKey,
          mnemonicKeyId: record.mnemonicKeyId,
          createdAt: record.createdAt,
        }
      : {
          version: record.version,
          rpId: record.rpId,
          credentialId: record.credentialId,
          prfSalt: record.prfSalt,
          wrappedVaultKey: record.wrappedVaultKey,
          createdAt: record.createdAt,
        };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(stableRecord)),
  );
  return arrayBufferToBase64(digest);
}
