import type { Hex } from "./pendingErc7715PermissionStorage";
import { handleUnlockWallet } from "./authHandlers";
import {
  getAutoLockTimeout,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedVault,
  tryRestoreSession,
} from "./sessionCache";
import { decryptAllKeys } from "./vaultCrypto";

export async function getLocalPrivateKeyForAccount(
  accountId: string,
  password: string,
): Promise<Hex | null> {
  let privateKey = getPrivateKeyFromCache(accountId);
  if (privateKey) return privateKey;

  const vaultKey = getCachedVaultKey();
  if (!vaultKey) {
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) {
        privateKey = getPrivateKeyFromCache(accountId);
      }
    }
  }

  if (privateKey) return privateKey;

  const cachedVaultKey = getCachedVaultKey();
  const vault = cachedVaultKey
    ? await (async () => {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        return decryptAllKeysWithVaultKey(cachedVaultKey);
      })()
    : await decryptAllKeys(password);

  if (!vault) return null;

  setCachedVault(vault);
  return getPrivateKeyFromCache(accountId);
}
