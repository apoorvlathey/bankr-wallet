/**
 * Persistent storage for pending signature requests
 * Signature requests are stored in chrome.storage.local and survive popup closes
 */

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
  // SECURITY: trusted context captured at request arrival. Optional for
  // backward compat with entries written by older builds.
  accountId?: string;
  accountAddress?: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase";
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
}

const STORAGE_KEY = "pendingSignatureRequests";
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
  request: PendingSignatureRequest
): Promise<void> {
  const requests = await getPendingSignatureRequests();
  requests.push(request);
  await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  await updateSignatureBadge();
}

/**
 * Remove a pending signature request by ID
 */
export async function removePendingSignatureRequest(sigId: string): Promise<void> {
  const requests = await getPendingSignatureRequests();
  const filtered = requests.filter((r) => r.id !== sigId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
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
  const requests = await getPendingSignatureRequests();
  const now = Date.now();
  const valid = requests.filter((r) => now - r.timestamp < SIGNATURE_EXPIRY_MS);

  if (valid.length !== requests.length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: valid });
    await updateSignatureBadge();
  }
}

/**
 * Update the extension badge with pending counts (combines tx and signature requests)
 */
export async function updateSignatureBadge(): Promise<void> {
  // Import getPendingTxRequests to combine counts
  const { getPendingTxRequests } = await import("./pendingTxStorage");
  const txRequests = await getPendingTxRequests();
  const sigRequests = await getPendingSignatureRequests();
  const count = txRequests.length + sigRequests.length;

  if (count > 0) {
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: "#3B82F6" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

/**
 * Clear all pending signature requests
 */
export async function clearAllPendingSignatureRequests(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await updateSignatureBadge();
}
