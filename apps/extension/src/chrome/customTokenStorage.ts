/**
 * Storage helper for user-added custom ERC-20 tokens.
 * Key: "customTokens" in chrome.storage.local
 */

export interface CustomToken {
  contractAddress: string; // always lowercase
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  /**
   * Optional logo URL. Populated when the token is added via
   * `wallet_watchAsset` (dapps pass an `image` field). User-added tokens
   * entered manually won't have one. Surfaced anywhere we render token
   * amounts inline (e.g. clear-signing card) so user-recognized tokens
   * keep their logo.
   */
  image?: string;
  addedAt: number;
}

const STORAGE_KEY = "customTokens";

export async function getCustomTokens(): Promise<CustomToken[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? [];
}

export async function addCustomToken(
  token: Omit<CustomToken, "addedAt">
): Promise<void> {
  const existing = await getCustomTokens();
  const key = `${token.chainId}-${token.contractAddress.toLowerCase()}`;
  if (existing.some((t) => `${t.chainId}-${t.contractAddress}` === key)) return;

  existing.push({
    ...token,
    contractAddress: token.contractAddress.toLowerCase(),
    addedAt: Date.now(),
  });
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

export async function updateCustomToken(
  chainId: number,
  contractAddress: string,
  updates: Partial<Pick<CustomToken, "name" | "symbol" | "decimals" | "image">>
): Promise<void> {
  const existing = await getCustomTokens();
  const addr = contractAddress.toLowerCase();
  const idx = existing.findIndex(
    (t) => t.chainId === chainId && t.contractAddress === addr
  );
  if (idx === -1) return;
  existing[idx] = { ...existing[idx], ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

export async function removeCustomToken(
  chainId: number,
  contractAddress: string
): Promise<void> {
  const existing = await getCustomTokens();
  const addr = contractAddress.toLowerCase();
  const filtered = existing.filter(
    (t) => !(t.chainId === chainId && t.contractAddress === addr)
  );
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}
