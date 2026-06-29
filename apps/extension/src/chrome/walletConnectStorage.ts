import { withStorageLock } from "./storageLock";

const STORAGE_KEY = "walletConnectPendingRequests";
const CHAIN_STORAGE_KEY = "walletConnectChainId";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const WALLETCONNECT_REQUEST_EXPIRY_MS = 30 * 60 * 1000;

export interface WalletConnectPendingRequest {
  id: string;
  kind: "transaction" | "signature" | "erc7715Permission";
  topic: string;
  requestId: number;
  method: string;
  timestamp: number;
}

type PendingRequestMap = Record<string, WalletConnectPendingRequest>;

export async function getWalletConnectChainId(): Promise<number | null> {
  const result = (await chrome.storage.local.get(CHAIN_STORAGE_KEY)) as {
    walletConnectChainId?: unknown;
  };
  const chainId = Number(result.walletConnectChainId);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : null;
}

export async function saveWalletConnectChainId(chainId: number): Promise<void> {
  await chrome.storage.local.set({ [CHAIN_STORAGE_KEY]: chainId });
}

export async function getWalletConnectPendingRequests(): Promise<PendingRequestMap> {
  const result = (await chrome.storage.local.get(STORAGE_KEY)) as {
    walletConnectPendingRequests?: PendingRequestMap;
  };
  return result.walletConnectPendingRequests || {};
}

export async function saveWalletConnectPendingRequest(
  request: WalletConnectPendingRequest,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    requests[request.id] = request;
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

export async function getWalletConnectPendingRequest(
  id: string,
): Promise<WalletConnectPendingRequest | null> {
  const requests = await getWalletConnectPendingRequests();
  return requests[id] || null;
}

export async function removeWalletConnectPendingRequest(
  id: string,
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    if (!requests[id]) return;
    delete requests[id];
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

export async function clearExpiredWalletConnectPendingRequests(): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getWalletConnectPendingRequests();
    const now = Date.now();
    let changed = false;

    for (const [id, request] of Object.entries(requests)) {
      if (now - request.timestamp > WALLETCONNECT_REQUEST_EXPIRY_MS) {
        delete requests[id];
        changed = true;
      }
    }

    if (changed) {
      await chrome.storage.local.set({ [STORAGE_KEY]: requests });
    }
  });
}
