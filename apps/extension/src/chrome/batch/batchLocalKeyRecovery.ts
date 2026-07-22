import { handleUnlockWallet } from "../authHandlers";
import { hasEncryptedApiKey, loadDecryptedApiKey } from "../crypto";
import {
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedApiKey,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import { decryptAllKeys } from "../vaultCrypto";

type LocalBatchKeyResult =
  | { ok: true; privateKey: `0x${string}` }
  | { ok: false; error: string };

export async function resolveLocalBatchPrivateKey(
  accountId: string,
  password: string,
): Promise<LocalBatchKeyResult> {
  let privateKey = getPrivateKeyFromCache(accountId);
  if (!privateKey && !getCachedVaultKey()) {
    const restored = await tryRestoreSession(handleUnlockWallet);
    if (restored) privateKey = getPrivateKeyFromCache(accountId);
  }
  if (privateKey) return { ok: true, privateKey };

  const cachedVaultKey = getCachedVaultKey();
  const vault = cachedVaultKey
    ? await (async () => {
        const { decryptAllKeysWithVaultKey } = await import("../authHandlers");
        return decryptAllKeysWithVaultKey(cachedVaultKey);
      })()
    : await decryptAllKeys(password);
  if (!vault) return { ok: false, error: "Invalid password" };
  setCachedVault(vault);
  if (await hasEncryptedApiKey()) {
    const apiKey = await loadDecryptedApiKey(password);
    if (apiKey) setCachedApiKey(apiKey, password);
  }
  privateKey = getPrivateKeyFromCache(accountId);
  return privateKey
    ? { ok: true, privateKey }
    : { ok: false, error: "Private key not found for account" };
}
