/** Released Bankr credential lookup and vault-format presence checks. */

import { decrypt } from "./passwordCipher";
import type { EncryptedData } from "./types";
import { decryptWithVaultKey } from "./vaultKey";

export async function loadDecryptedApiKey(
  password: string,
): Promise<string | null> {
  const { getCachedVaultKey } = await import("../sessionCache");
  const vaultKey = getCachedVaultKey();

  if (vaultKey) {
    const { encryptedApiKeyVault } = await chrome.storage.local.get(
      "encryptedApiKeyVault",
    );
    if (encryptedApiKeyVault) {
      const apiKey = await decryptWithVaultKey(
        vaultKey,
        encryptedApiKeyVault,
      );
      if (apiKey) return apiKey;
    }
  }

  const { encryptedApiKey } = (await chrome.storage.local.get(
    "encryptedApiKey",
  )) as { encryptedApiKey: EncryptedData | undefined };
  if (!encryptedApiKey) return null;

  try {
    return await decrypt(encryptedApiKey, password);
  } catch {
    return null;
  }
}

export async function hasEncryptedApiKey(): Promise<boolean> {
  const { encryptedApiKey, encryptedApiKeyVault } =
    await chrome.storage.local.get([
      "encryptedApiKey",
      "encryptedApiKeyVault",
    ]);
  return !!encryptedApiKey || !!encryptedApiKeyVault;
}

export async function hasVaultKeySystem(): Promise<boolean> {
  const { encryptedVaultKeyMaster } = await chrome.storage.local.get(
    "encryptedVaultKeyMaster",
  );
  return !!encryptedVaultKeyMaster;
}

export async function isAgentPasswordEnabled(): Promise<boolean> {
  const { agentPasswordEnabled } = await chrome.storage.local.get(
    "agentPasswordEnabled",
  );
  return !!agentPasswordEnabled;
}
