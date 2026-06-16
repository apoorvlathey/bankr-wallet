/**
 * Persistent storage for pending transaction requests
 * Transactions are stored in chrome.storage.local and survive popup closes
 */

import { TransactionParams } from "./bankrApi";
import { withStorageLock } from "./storageLock";

export interface PendingTxRequest {
  id: string;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  timestamp: number;
  // SECURITY: trusted context captured at request arrival. Optional on the
  // STORED shape for backward compat with entries written by older builds —
  // new requests must use `PinnedTxRequest` (see below) so the compiler
  // forces these to be set at creation time.
  accountId?: string;
  accountAddress?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase";
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  walletConnect?: {
    topic: string;
    requestId: number;
    method: string;
    peerName: string;
    peerUrl?: string;
    peerIcon?: string | null;
  };
  // Split mode: this request is one slice of a wallet_sendCalls bundle the
  // user manually split into N sequential single-tx confirmations. The
  // confirmation UI uses these to (a) show "Step N of M", (b) gate the
  // Confirm button until the prior split tx lands onchain, and (c) tell
  // the finalization hook which bundle to advance after this tx terminates.
  parentBundleId?: string;
  bundleIndex?: number;
  bundleTotalCalls?: number;
  /**
   * Marks this tx as an EIP-7702 set-delegate (or revoke when target = 0x0).
   * The PK confirm path uses this to sign an authorization tuple at broadcast
   * time and route through the type-4 signer. The confirmation UI uses it to
   * show a human-readable summary instead of generic "send 0 to self".
   *
   * For revokes, also clears the saved custom-delegate storage entry after
   * the tx is broadcast so the next batch falls back to default.
   */
  delegation7702Meta?: {
    targetDelegate: `0x${string}`;
    kind: "revoke" | "setDelegate";
  };
}

/**
 * Creation-time shape: pinning fields are REQUIRED. Every new pending
 * request must be constructed with `pinnedTxRequest(account, base)` from
 * `./pinnedRequest`, which guarantees these fields and excludes
 * impersonator accounts at the type level.
 */
export type PinnedTxRequest = PendingTxRequest &
  Required<Pick<PendingTxRequest, "accountId" | "accountAddress" | "accountType">>;

const STORAGE_KEY = "pendingTxRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
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
  request: PinnedTxRequest
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingTxRequests();
    requests.push(request);
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
  await updateBadge();
}

/**
 * Remove a pending transaction request by ID
 */
export async function removePendingTxRequest(txId: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingTxRequests();
    const filtered = requests.filter((r) => r.id !== txId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
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
  let changed = false;
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingTxRequests();
    const now = Date.now();
    const valid = requests.filter((r) => now - r.timestamp < TX_EXPIRY_MS);

    if (valid.length !== requests.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: valid });
      changed = true;
    }
  });
  if (changed) await updateBadge();
}

/**
 * Update the extension badge with pending request counts.
 *
 * A cross-dapp batch counts as one pending item, even when it contains many
 * staged calls, because the user will handle it with one confirmation.
 */
export async function updateBadge(): Promise<void> {
  const txRequests = await getPendingTxRequests();
  const { getPendingSignatureRequests } = await import("./pendingSignatureStorage");
  const { getPendingBatchTxRequests } = await import("./pendingBatchTxStorage");
  const { getCrossDappBatch } = await import("./crossDappBatchStorage");
  const sigRequests = await getPendingSignatureRequests();
  const batchRequests = await getPendingBatchTxRequests();
  const crossDappBatch = await getCrossDappBatch();
  const crossDappBatchCount = crossDappBatch?.entries.length ? 1 : 0;
  const count =
    txRequests.length +
    sigRequests.length +
    batchRequests.length +
    crossDappBatchCount;

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
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingTxRequests();
    const idx = requests.findIndex((r) => r.id === txId);
    if (idx === -1) return;
    requests[idx].tx.data = newData;
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
}

/**
 * Clear all pending transaction requests
 */
export async function clearAllPendingTxRequests(): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  });
  await updateBadge();
}
