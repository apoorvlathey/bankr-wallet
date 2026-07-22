import { hasEncryptedApiKey, loadDecryptedApiKey } from "../crypto";
import {
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedApiKey,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import { decryptAllKeys } from "../vaultCrypto";
import type { LocalSigningAccount } from "./localExecution";

type LocalTransactionKeyResult =
  | { ok: true; privateKey: `0x${string}` }
  | { ok: false; error: string };

export async function resolveLocalTransactionKey(
  account: LocalSigningAccount,
  password: string,
): Promise<LocalTransactionKeyResult> {
  let privateKey = getPrivateKeyFromCache(account.id);
  if (privateKey) return { ok: true, privateKey };
  if (!getCachedVaultKey()) {
    const { handleUnlockWallet } = await import("../authHandlers");
    if (await tryRestoreSession(handleUnlockWallet)) {
      privateKey = getPrivateKeyFromCache(account.id);
    }
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
  privateKey = getPrivateKeyFromCache(account.id);
  return privateKey
    ? { ok: true, privateKey }
    : { ok: false, error: "Private key not found for account" };
}
