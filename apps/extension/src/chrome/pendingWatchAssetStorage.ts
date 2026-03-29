/**
 * Persistent storage for pending wallet_watchAsset requests.
 * Requests are stored in chrome.storage.local and survive popup closes.
 */

export interface WatchAssetParams {
  address: string;
  symbol: string;
  decimals: number;
  image?: string;
}

export interface PendingWatchAssetRequest {
  id: string;
  asset: WatchAssetParams;
  chainId: number;
  origin: string;
  favicon: string | null;
  timestamp: number;
}

const STORAGE_KEY = "pendingWatchAssetRequests";

export async function getPendingWatchAssetRequests(): Promise<PendingWatchAssetRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function savePendingWatchAssetRequest(
  request: PendingWatchAssetRequest
): Promise<void> {
  const requests = await getPendingWatchAssetRequests();
  requests.push(request);
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
}

export async function removePendingWatchAssetRequest(id: string): Promise<void> {
  const requests = await getPendingWatchAssetRequests();
  const filtered = requests.filter((r) => r.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}
