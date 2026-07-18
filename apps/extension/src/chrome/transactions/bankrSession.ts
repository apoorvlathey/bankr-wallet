import { handleUnlockWallet } from "../authHandlers";
import { loadDecryptedApiKey } from "../crypto";
import {
  getCachedApiKey,
  getCachedPassword,
  setCachedApiKey,
  tryRestoreSession,
} from "../sessionCache";

/** Resolve a Bankr credential without accepting a plaintext fallback. */
export async function getUnlockedBankrApiKey(): Promise<string | null> {
  let apiKey = getCachedApiKey();
  if (apiKey) return apiKey;

  if (!getCachedPassword()) {
    await tryRestoreSession(handleUnlockWallet);
    apiKey = getCachedApiKey();
  }
  return apiKey;
}

/** Resolve confirmation credentials, allowing the reviewed password fallback. */
export async function getBankrApiKeyForConfirmation(
  password: string,
): Promise<string | null> {
  let apiKey = await getUnlockedBankrApiKey();
  if (apiKey) return apiKey;

  apiKey = await loadDecryptedApiKey(password);
  if (!apiKey) return null;
  setCachedApiKey(apiKey, password);
  return apiKey;
}
