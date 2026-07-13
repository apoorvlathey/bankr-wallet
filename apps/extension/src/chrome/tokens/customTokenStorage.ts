import { withStorageLock } from "../storageLock";
import type { CustomToken } from "./types";

export const CUSTOM_TOKENS_STORAGE_KEY = "customTokens";
const STORAGE_LOCK_KEY = `local:${CUSTOM_TOKENS_STORAGE_KEY}`;

export async function getCustomTokens(): Promise<CustomToken[]> {
  const result = await chrome.storage.local.get(CUSTOM_TOKENS_STORAGE_KEY);
  return result[CUSTOM_TOKENS_STORAGE_KEY] ?? [];
}

export async function addCustomToken(
  token: Omit<CustomToken, "addedAt">,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const existing = await getCustomTokens();
    const key = `${token.chainId}-${token.contractAddress.toLowerCase()}`;
    if (
      existing.some(
        (entry) => `${entry.chainId}-${entry.contractAddress}` === key,
      )
    ) {
      return;
    }

    existing.push({
      ...token,
      contractAddress: token.contractAddress.toLowerCase(),
      addedAt: Date.now(),
    });
    await chrome.storage.local.set({ [CUSTOM_TOKENS_STORAGE_KEY]: existing });
  });
}

export async function updateCustomToken(
  chainId: number,
  contractAddress: string,
  updates: Partial<
    Pick<CustomToken, "name" | "symbol" | "decimals" | "image">
  >,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const existing = await getCustomTokens();
    const address = contractAddress.toLowerCase();
    const index = existing.findIndex(
      (token) =>
        token.chainId === chainId && token.contractAddress === address,
    );
    if (index === -1) return;
    existing[index] = { ...existing[index], ...updates };
    await chrome.storage.local.set({ [CUSTOM_TOKENS_STORAGE_KEY]: existing });
  });
}

export async function removeCustomToken(
  chainId: number,
  contractAddress: string,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const existing = await getCustomTokens();
    const address = contractAddress.toLowerCase();
    const filtered = existing.filter(
      (token) =>
        !(token.chainId === chainId && token.contractAddress === address),
    );
    await chrome.storage.local.set({
      [CUSTOM_TOKENS_STORAGE_KEY]: filtered,
    });
  });
}
