/**
 * Persistent storage for pending wallet_watchAsset requests.
 * Requests are stored in chrome.storage.local and survive popup closes.
 */

import { withStorageLock } from "./storageLock";

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
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;

export async function getPendingWatchAssetRequests(): Promise<PendingWatchAssetRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function savePendingWatchAssetRequest(
  request: PendingWatchAssetRequest
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingWatchAssetRequests();
    requests.push(request);
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

export async function removePendingWatchAssetRequest(id: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingWatchAssetRequests();
    const filtered = requests.filter((r) => r.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
}
