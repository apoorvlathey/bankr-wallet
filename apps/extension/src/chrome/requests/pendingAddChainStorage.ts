/**
 * Persistent storage for pending wallet_addEthereumChain requests.
 * Requests are stored in chrome.storage.local and survive popup closes.
 */

import { withStorageLock } from "../storageLock";

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
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
}

const STORAGE_KEY = "pendingAddChainRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const REQUEST_EXPIRY_MS = 5 * 60 * 1000;
const MAX_PENDING_REQUESTS = 20;
const MAX_PENDING_REQUESTS_PER_ORIGIN = 5;

export async function getPendingAddChainRequests(): Promise<PendingAddChainRequest[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function savePendingAddChainRequest(
  request: PendingAddChainRequest
): Promise<void> {
  await clearExpiredAddChainRequests();
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingAddChainRequests();
    if (requests.some((pending) => pending.id === request.id)) {
      throw new Error("Chain request already exists");
    }
    if (requests.length >= MAX_PENDING_REQUESTS) {
      throw new Error("Too many pending chain requests");
    }
    if (
      requests.filter((pending) => pending.origin === request.origin).length >=
      MAX_PENDING_REQUESTS_PER_ORIGIN
    ) {
      throw new Error("This site has too many pending chain requests");
    }
    requests.push(request);
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

export async function removePendingAddChainRequest(id: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingAddChainRequests();
    const filtered = requests.filter((r) => r.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
}

export async function clearExpiredAddChainRequests(): Promise<void> {
  const expiredBefore = Date.now() - REQUEST_EXPIRY_MS;
  const expired = (await getPendingAddChainRequests()).filter(
    (request) => request.timestamp <= expiredBefore,
  );
  if (expired.length === 0) return;
  const { expirePersistedMetadataPrompt } = await import(
    "./pendingMetadataPromptLifecycle"
  );
  await Promise.all(
    expired.map((request) =>
      expirePersistedMetadataPrompt("addChain", request.id, expiredBefore),
    ),
  );
}
