import { handleUnlockWallet } from "../authHandlers";
import { decryptWithVaultKey } from "../crypto";
import {
  getCachedVaultKey,
  tryRestoreSession,
} from "../sessionCache";
import {
  parseSponsoredTransferRelayPayload,
  type SponsoredTransferIntentRecord,
  type SponsoredTransferRelayPayload,
} from "./intentStorage";

export async function ensureSponsoredVaultKey(): Promise<CryptoKey | null> {
  let vaultKey = getCachedVaultKey();
  if (!vaultKey) {
    await tryRestoreSession(handleUnlockWallet);
    vaultKey = getCachedVaultKey();
  }
  return vaultKey;
}

export async function decryptSponsoredTransferPayload(
  record: SponsoredTransferIntentRecord,
  vaultKey: CryptoKey,
): Promise<SponsoredTransferRelayPayload> {
  const plaintext = await decryptWithVaultKey(vaultKey, record.encryptedPayload);
  if (!plaintext) {
    throw new Error("Sponsored transfer recovery state could not be decrypted");
  }
  const payload = parseSponsoredTransferRelayPayload(JSON.parse(plaintext));
  if (
    payload.from.toLowerCase() !== record.accountAddress.toLowerCase() ||
    payload.to.toLowerCase() !== record.to.toLowerCase() ||
    payload.value !== record.value ||
    payload.validBefore !== String(record.validBefore)
  ) {
    throw new Error(
      "Sponsored transfer recovery state does not match the reviewed intent",
    );
  }
  return payload;
}
