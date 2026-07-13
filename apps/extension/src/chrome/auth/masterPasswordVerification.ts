import { getAccounts } from "../accountStorage";
import { decrypt, tryDecryptVaultKey } from "../crypto";
import { validateGeneralVaultMasterRecovery } from "../generalVaultIntegrity";
import { validateV2MnemonicMasterRecovery } from "../mnemonic/integrity";
import type { DecryptedEntry } from "../types";
import {
  decryptAllKeys,
  hasVaultEntries,
} from "../vaultCrypto";

/**
 * Verifies the master password without hydrating or changing the active
 * session. Passkey sessions intentionally cannot supply this material.
 */
export async function verifyMasterPassword(password: string): Promise<boolean> {
  if (!password) return false;

  const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
    "encryptedVaultKeyMaster",
  );
  if (encryptedVaultKeyMaster) {
    const vaultKeyBytes = await tryDecryptVaultKey(
      encryptedVaultKeyMaster,
      password,
    );
    if (!vaultKeyBytes) return false;

    // Decrypting a syntactically valid wrapper is not enough proof that this
    // is the wallet's current master password: a corrupt/replaced wrapper can
    // authenticate while recovering the wrong random key. This matters most
    // during a biometric session, where accepting that unrelated password
    // would otherwise authorize revealing keys already present in memory.
    const [generalIntegrity, mnemonicIntegrity] = await Promise.all([
      validateGeneralVaultMasterRecovery(vaultKeyBytes, password),
      validateV2MnemonicMasterRecovery(password),
    ]);
    return generalIntegrity.success && mnemonicIntegrity.success;
  }

  const [{ encryptedApiKey }, hasVault, accounts] = await Promise.all([
    chrome.storage.local.get("encryptedApiKey"),
    hasVaultEntries(),
    getAccounts(),
  ]);

  // Legacy verification must be independent of the active session cache.
  // loadDecryptedApiKey() intentionally prefers a cached vault key, which
  // would make it unsuitable as proof that this specific password is valid.
  if (encryptedApiKey) {
    try {
      await decrypt(encryptedApiKey, password);
    } catch {
      return false;
    }
  }
  let decryptedVault: DecryptedEntry[] = [];
  if (hasVault) {
    const decrypted = await decryptAllKeys(password);
    if (!decrypted) return false;
    decryptedVault = decrypted;
  }

  // decryptAllKeys intentionally filters ID/address mismatches out of the
  // signing cache. Verification must not mistake that safe empty result for
  // successful recovery of every visible legacy local account.
  const recoveredIds = new Set(decryptedVault.map((entry) => entry.id));
  if (
    accounts.some(
      (account) =>
        (account.type === "privateKey" || account.type === "seedPhrase") &&
        !recoveredIds.has(account.id),
    )
  ) {
    return false;
  }

  return !!encryptedApiKey || hasVault;
}
