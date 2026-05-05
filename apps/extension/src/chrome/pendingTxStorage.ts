/**
 * Persistent storage for pending transaction requests
 * Transactions are stored in chrome.storage.local and survive popup closes
 */

import { TransactionParams } from "./bankrApi";

export interface PendingTxRequest {
  id: string;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  timestamp: number;
  // SECURITY: trusted context captured at request arrival. Optional for
  // backward compat with entries written by older builds.
  accountId?: string;
  accountAddress?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase";
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  // Split mode: this request is one slice of a wallet_sendCalls bundle the
  // user manually split into N sequential single-tx confirmations. The
  // confirmation UI uses these to (a) show "Step N of M", (b) gate the
  // Confirm button until the prior split tx lands on-chain, and (c) tell
  // the finalization hook which bundle to advance after this tx terminates.
  parentBundleId?: string;
  bundleIndex?: number;
  bundleTotalCalls?: number;
}

const STORAGE_KEY = "pendingTxRequests";
const TX_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get all pending transaction requests
 */
export async function getPendingTxRequests(): Promise<PendingTxRequest[]> {
  const { pendingTxRequests } = (await chrome.storage.local.get(STORAGE_KEY)) as {
    pendingTxRequests?: PendingTxRequest[];
  };
  return pendingTxRequests || [];
}

/**
 * Save a new pending transaction request
 */
export async function savePendingTxRequest(
  request: PendingTxRequest
): Promise<void> {
  const requests = await getPendingTxRequests();
  requests.push(request);
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  await updateBadge();
}

/**
 * Remove a pending transaction request by ID
 */
export async function removePendingTxRequest(txId: string): Promise<void> {
  const requests = await getPendingTxRequests();
  const filtered = requests.filter((r) => r.id !== txId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  await updateBadge();
}

/**
 * Get a specific pending transaction request by ID
 */
export async function getPendingTxRequestById(
  txId: string
): Promise<PendingTxRequest | null> {
  const requests = await getPendingTxRequests();
  return requests.find((r) => r.id === txId) || null;
}

/**
 * Clear expired transaction requests (older than 30 minutes)
 */
export async function clearExpiredTxRequests(): Promise<void> {
  const requests = await getPendingTxRequests();
  const now = Date.now();
  const valid = requests.filter((r) => now - r.timestamp < TX_EXPIRY_MS);

  if (valid.length !== requests.length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: valid });
    await updateBadge();
  }
}

/**
 * Update the extension badge with pending counts (combines tx, signature, batch
 * requests, and any entries the user has staged in the cross-dapp batch).
 */
export async function updateBadge(): Promise<void> {
  const txRequests = await getPendingTxRequests();
  const { getPendingSignatureRequests } = await import("./pendingSignatureStorage");
  const { getPendingBatchTxRequests } = await import("./pendingBatchTxStorage");
  const { getCrossDappBatch } = await import("./crossDappBatchStorage");
  const sigRequests = await getPendingSignatureRequests();
  const batchRequests = await getPendingBatchTxRequests();
  const crossDappBatch = await getCrossDappBatch();
  const count =
    txRequests.length +
    sigRequests.length +
    batchRequests.length +
    (crossDappBatch?.entries.length ?? 0);

  if (count > 0) {
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: "#3B82F6" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

/**
 * Update the calldata of a pending transaction request (e.g. modified approval amount)
 */
export async function updatePendingTxRequestData(
  txId: string,
  newData: string,
): Promise<void> {
  const requests = await getPendingTxRequests();
  const idx = requests.findIndex((r) => r.id === txId);
  if (idx === -1) return;
  requests[idx].tx.data = newData;
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
}

/**
 * Clear all pending transaction requests
 */
export async function clearAllPendingTxRequests(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await updateBadge();
}
