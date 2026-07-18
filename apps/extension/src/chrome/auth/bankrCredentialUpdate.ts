import {
  type EncryptedData,
  encrypt,
  encryptWithVaultKey,
} from "../crypto";
import { getAuthCeremonyEpoch } from "../authTransition";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import {
  getCachedPassword,
  getCachedVaultKey,
  getPasswordType,
  resolvePasswordType,
  setCachedApiKey,
  tryRestoreSession,
} from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  checkHasVaultKeySystem,
  handleUnlockWallet,
} from "./walletUnlock";

export type PreparedApiKeyUpdate = {
  success: true;
  apiKey: string;
  expectedAuthEpoch: string;
  storageUpdate: Partial<{
    encryptedApiKeyVault: EncryptedData;
    encryptedApiKey: EncryptedData | null;
  }>;
};

/** Saves a replacement API key through the same prepared atomic boundary. */
export async function handleSaveApiKeyWithCachedPassword(
  newApiKey: string,
): Promise<{ success: boolean; error?: string }> {
  const prepared = await prepareApiKeyUpdateWithCachedPassword(newApiKey);
  if (!prepared.success) return prepared;

  try {
    return await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      assertCurrentMasterAuthorization(prepared.expectedAuthEpoch);
      await chrome.storage.local.set(prepared.storageUpdate);
      commitPreparedApiKeyUpdate(prepared);
      return { success: true };
    });
  } catch (error) {
    console.error("[authHandlers]", error);
    return { success: false, error: "Failed to save API key" };
  }
}

/** Encrypts a replacement credential without publishing it. */
export async function prepareApiKeyUpdateWithCachedPassword(
  newApiKey: string,
): Promise<PreparedApiKeyUpdate | { success: false; error: string }> {
  const normalizedApiKey =
    typeof newApiKey === "string" ? newApiKey.trim() : "";
  if (!normalizedApiKey || normalizedApiKey.length > 65_536) {
    return { success: false, error: "Invalid API key" };
  }

  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType !== "master") {
    return { success: false, error: "API key changes require master password" };
  }
  let vaultKey = getCachedVaultKey();
  let password = getCachedPassword();

  if (!password && !vaultKey) {
    const restored = await tryRestoreSession(handleUnlockWallet);
    if (restored) {
      password = getCachedPassword();
      vaultKey = getCachedVaultKey();
    }
  }

  // A getter may have expired and cleared the cache after vaultKey was read.
  if (getPasswordType() !== "master") {
    return { success: false, error: "Wallet is locked. Please unlock again." };
  }
  const expectedAuthEpoch = getAuthCeremonyEpoch();

  if (!vaultKey && !password) {
    return { success: false, error: "Wallet is locked. Please unlock first." };
  }

  try {
    if (vaultKey) {
      const encrypted = await encryptWithVaultKey(vaultKey, normalizedApiKey);
      return {
        success: true,
        apiKey: normalizedApiKey,
        expectedAuthEpoch,
        storageUpdate: {
          encryptedApiKeyVault: encrypted,
          encryptedApiKey: null,
        },
      };
    }

    if (await checkHasVaultKeySystem()) {
      return {
        success: false,
        error: "Wallet is locked. Please unlock again.",
      };
    }
    return {
      success: true,
      apiKey: normalizedApiKey,
      expectedAuthEpoch,
      storageUpdate: {
        encryptedApiKey: await encrypt(normalizedApiKey, password!),
      },
    };
  } catch (error) {
    console.error("[authHandlers]", error);
    return { success: false, error: "Failed to save API key" };
  }
}

export function commitPreparedApiKeyUpdate(
  prepared: PreparedApiKeyUpdate,
): void {
  // Passkey master sessions intentionally have no cached plaintext password.
  setCachedApiKey(prepared.apiKey);
}
