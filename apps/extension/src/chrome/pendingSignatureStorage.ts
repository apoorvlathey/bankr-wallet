/**
 * Persistent storage for pending signature requests
 * Signature requests are stored in chrome.storage.local and survive popup closes
 */

import { withStorageLock } from "./storageLock";

export type SignatureMethod =
  | "personal_sign"
  | "eth_sign"
  | "eth_signTypedData"
  | "eth_signTypedData_v3"
  | "eth_signTypedData_v4";

export interface SignatureParams {
  method: SignatureMethod;
  params: any[];
  chainId: number;
}

export interface PendingSignatureRequest {
  id: string;
  signature: SignatureParams;
  origin: string;
  favicon: string | null;
  chainName: string;
  timestamp: number;
  // SECURITY: trusted context captured at request arrival. Optional on the
  // STORED shape for backward compat with entries written by older builds —
  // new requests must use `PinnedSignatureRequest` (see below) so the
  // compiler forces these to be set at creation time.
  accountId?: string;
  accountAddress?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
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
}

/**
 * Creation-time shape: pinning fields are REQUIRED. Construct via
 * `pinnedSignatureRequest(account, base)` in `./pinnedRequest`.
 */
export type PinnedSignatureRequest = PendingSignatureRequest &
  Required<Pick<PendingSignatureRequest, "accountId" | "accountAddress" | "accountType">>;

const STORAGE_KEY = "pendingSignatureRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const SIGNATURE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get all pending signature requests
 */
export async function getPendingSignatureRequests(): Promise<PendingSignatureRequest[]> {
  const { pendingSignatureRequests } = (await chrome.storage.local.get(STORAGE_KEY)) as {
    pendingSignatureRequests?: PendingSignatureRequest[];
  };
  return pendingSignatureRequests || [];
}

/**
 * Save a new pending signature request
 */
export async function savePendingSignatureRequest(
  request: PinnedSignatureRequest
): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingSignatureRequests();
    requests.push(request);
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
  await updateSignatureBadge();
}

/**
 * Remove a pending signature request by ID
 */
export async function removePendingSignatureRequest(sigId: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingSignatureRequests();
    const filtered = requests.filter((r) => r.id !== sigId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
  await updateSignatureBadge();
}

/**
 * Get a specific pending signature request by ID
 */
export async function getPendingSignatureRequestById(
  sigId: string
): Promise<PendingSignatureRequest | null> {
  const requests = await getPendingSignatureRequests();
  return requests.find((r) => r.id === sigId) || null;
}

/**
 * Clear expired signature requests (older than 30 minutes)
 */
export async function clearExpiredSignatureRequests(): Promise<void> {
  let changed = false;
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingSignatureRequests();
    const now = Date.now();
    const valid = requests.filter((r) => now - r.timestamp < SIGNATURE_EXPIRY_MS);

    if (valid.length !== requests.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: valid });
      changed = true;
    }
  });
  if (changed) await updateSignatureBadge();
}

/**
 * Update the extension badge with pending counts.
 *
 * Keep this as a compatibility wrapper so signature storage uses the same
 * central count as tx, ERC-5792 batch, and cross-dapp batch storage.
 */
export async function updateSignatureBadge(): Promise<void> {
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

/**
 * Clear all pending signature requests
 */
export async function clearAllPendingSignatureRequests(): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  });
  await updateSignatureBadge();
}
