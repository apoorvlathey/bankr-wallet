import {
  WALLET_SECRET_STORAGE_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  parseMnemonicVault,
  type StoredMnemonicVault,
} from "./record";

const MNEMONIC_VAULT_KEY = "mnemonicVault";

export function withMnemonicVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  return withStorageLock(WALLET_SECRET_STORAGE_LOCK_KEY, fn);
}

export async function loadMnemonicVault(): Promise<StoredMnemonicVault | null> {
  const result = await chrome.storage.local.get(MNEMONIC_VAULT_KEY);
  return parseMnemonicVault(result[MNEMONIC_VAULT_KEY]);
}

/** Internal repository writer; public mutations remain in coordination layers. */
export async function saveMnemonicVault(
  vault: StoredMnemonicVault,
): Promise<void> {
  await chrome.storage.local.set({ [MNEMONIC_VAULT_KEY]: vault });
}
