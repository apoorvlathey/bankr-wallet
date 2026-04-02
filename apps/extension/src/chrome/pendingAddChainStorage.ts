/**
 * Persistent storage for pending wallet_addEthereumChain requests.
 * Requests are stored in chrome.storage.local and survive popup closes.
 */

export interface PendingAddChainRequest {
  id: string;
  chainId: number;
  chainName?: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  rpcUrls?: string[];
  blockExplorerUrls?: string[];
  origin: string;
  favicon: string | null;
  timestamp: number;
}

const STORAGE_KEY = "pendingAddChainRequests";

export async function getPendingAddChainRequests(): Promise<PendingAddChainRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function savePendingAddChainRequest(
  request: PendingAddChainRequest
): Promise<void> {
  const requests = await getPendingAddChainRequests();
  requests.push(request);
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
}

export async function removePendingAddChainRequest(id: string): Promise<void> {
  const requests = await getPendingAddChainRequests();
  const filtered = requests.filter((r) => r.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}
