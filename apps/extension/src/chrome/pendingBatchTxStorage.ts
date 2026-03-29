/**
 * Persistent storage for pending batch transaction requests (ERC-5792)
 * Mirrors pendingTxStorage.ts pattern
 */

import type { PendingBatchTxRequest } from "./erc5792Types";

const STORAGE_KEY = "pendingBatchTxRequests";
const TX_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export async function getPendingBatchTxRequests(): Promise<PendingBatchTxRequest[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

export async function savePendingBatchTxRequest(
  request: PendingBatchTxRequest,
): Promise<void> {
  const requests = await getPendingBatchTxRequests();
  requests.push(request);
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export async function removePendingBatchTxRequest(bundleId: string): Promise<void> {
  const requests = await getPendingBatchTxRequests();
  const filtered = requests.filter((r) => r.id !== bundleId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export async function getPendingBatchTxRequestById(
  bundleId: string,
): Promise<PendingBatchTxRequest | null> {
  const requests = await getPendingBatchTxRequests();
  return requests.find((r) => r.id === bundleId) || null;
}

export async function clearExpiredBatchTxRequests(): Promise<void> {
  const requests = await getPendingBatchTxRequests();
  const now = Date.now();
  const valid = requests.filter((r) => now - r.timestamp < TX_EXPIRY_MS);

  if (valid.length !== requests.length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: valid });
    const { updateBadge } = await import("./pendingTxStorage");
    await updateBadge();
  }
}
