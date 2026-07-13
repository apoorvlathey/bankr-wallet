import type { Vault } from "../types";
import {
  assertVaultSafeForMutation,
  parseReleasedVaultV1,
} from "./recordCodec";

/** Released private-key vault key and record version remain unchanged. */
export const VAULT_STORAGE_KEY = "pkVault";

export async function loadVault(): Promise<Vault | null> {
  const result = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  return parseReleasedVaultV1(result[VAULT_STORAGE_KEY]);
}

export async function saveVault(vault: Vault): Promise<void> {
  assertVaultSafeForMutation(vault);
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
}

export function createEmptyVault(): Vault {
  return {
    version: 1,
    entries: [],
  };
}

export async function clearVault(): Promise<void> {
  await chrome.storage.local.remove(VAULT_STORAGE_KEY);
}

export async function hasVaultEntries(): Promise<boolean> {
  const vault = await loadVault();
  return vault !== null && vault.entries.length > 0;
}
