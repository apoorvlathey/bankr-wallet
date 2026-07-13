import {
  decrypt,
  decryptWithVaultKey,
  importVaultKey,
  type EncryptedData,
} from "../crypto";
import { getAccounts } from "../accountStorage";
import { deriveAddress } from "../localSigner";
import { privateKeyMatchesAccount } from "./accountIntegrity";
import {
  decryptPrivateKey,
  decryptPrivateKeyWithVaultKey,
  isVaultKeyEncrypted,
} from "./entryCrypto";
import { loadVault } from "./repository";

export interface GeneralVaultIntegrityResult {
  success: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Proves that an explicitly master-unwrapped general vault key can recover all
 * current API/private-key material before another recovery factor is removed.
 * Orphan vault entries are preserved, but must still decrypt to valid keys.
 */
export async function validateGeneralVaultMasterRecovery(
  vaultKeyBytes: Uint8Array,
  masterPassword: string,
): Promise<GeneralVaultIntegrityResult> {
  if (vaultKeyBytes.byteLength !== 32) {
    return { success: false, error: "Wallet key protection is invalid" };
  }

  try {
    const [vaultKey, stored, vault, accounts] = await Promise.all([
      importVaultKey(vaultKeyBytes),
      chrome.storage.local.get(["encryptedApiKeyVault", "encryptedApiKey"]),
      loadVault(),
      getAccounts(),
    ]);

    if (!Array.isArray(accounts)) {
      return { success: false, error: "Account metadata could not be verified" };
    }
    if (
      vault !== null &&
      (vault.version !== 1 || !Array.isArray(vault.entries))
    ) {
      return { success: false, error: "Private-key vault is invalid" };
    }
    const accountIds = new Set<string>();
    for (const account of accounts) {
      if (
        typeof account?.id !== "string" ||
        account.id.length === 0 ||
        accountIds.has(account.id)
      ) {
        return { success: false, error: "Account metadata could not be verified" };
      }
      accountIds.add(account.id);
    }

    if (stored.encryptedApiKeyVault) {
      const apiKey = await decryptWithVaultKey(
        vaultKey,
        stored.encryptedApiKeyVault as EncryptedData,
      );
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        return { success: false, error: "Bankr credential could not be recovered" };
      }
    } else if (stored.encryptedApiKey) {
      const apiKey = await decrypt(
        stored.encryptedApiKey as EncryptedData,
        masterPassword,
      );
      if (apiKey.trim().length === 0) {
        return { success: false, error: "Bankr credential could not be recovered" };
      }
    } else if (accounts.some((account) => account.type === "bankr")) {
      return { success: false, error: "A Bankr account is missing its credential" };
    }

    const localAccounts = accounts.filter(
      (account) =>
        account.type === "privateKey" || account.type === "seedPhrase",
    );
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const recoveredIds = new Set<string>();

    for (const entry of vault?.entries ?? []) {
      const keystore = entry?.keystore;
      if (
        typeof entry?.id !== "string" ||
        entry.id.length === 0 ||
        !isRecord(keystore) ||
        typeof keystore.ciphertext !== "string" ||
        typeof keystore.iv !== "string" ||
        typeof keystore.salt !== "string"
      ) {
        return { success: false, error: "Private-key vault is invalid" };
      }
      if (recoveredIds.has(entry.id)) {
        return { success: false, error: "Private-key vault contains duplicate entries" };
      }
      recoveredIds.add(entry.id);

      const privateKey = isVaultKeyEncrypted(keystore)
        ? await decryptPrivateKeyWithVaultKey(keystore, vaultKey)
        : await decryptPrivateKey(
            keystore as unknown as Parameters<typeof decryptPrivateKey>[0],
            masterPassword,
          );
      if (!privateKey) {
        return { success: false, error: "Private-key vault could not be recovered" };
      }

      const account = accountById.get(entry.id);
      if (account) {
        if (!privateKeyMatchesAccount(account, privateKey)) {
          return {
            success: false,
            error: "A private key does not match its account",
          };
        }
      } else {
        // Failed writes in older builds can leave orphan ciphertext. Preserve
        // it, but do not discard the last factor unless it is recoverable.
        try {
          deriveAddress(privateKey);
        } catch {
          return { success: false, error: "Private-key vault contains an invalid key" };
        }
      }
    }

    if (localAccounts.some((account) => !recoveredIds.has(account.id))) {
      return { success: false, error: "A local account is missing its private key" };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Wallet secrets could not be recovered" };
  }
}
