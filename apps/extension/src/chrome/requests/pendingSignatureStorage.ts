/**
 * Persistent storage for pending signature requests
 * Signature requests are stored in chrome.storage.local and survive popup closes
 */

import { withStorageLock } from "../storageLock";
import { bindPendingBankrCredential } from "../bankr/credentialBinding";

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
  /** Non-secret ciphertext-generation binding for Bankr signer requests. */
  bankrCredentialTag?: string;
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  /** Explicit service-worker-authored request; never accepted from a webpage. */
  trustedInternal?: true;
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
 * `pinnedSignatureRequest(account, base)` in ../requests/pinnedRequest`.
 */
export type PinnedSignatureRequest = PendingSignatureRequest &
  Required<Pick<PendingSignatureRequest, "accountId" | "accountAddress" | "accountType">>;

const STORAGE_KEY = "pendingSignatureRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const MAX_PENDING_SIGNATURE_REQUESTS = 50;
const MAX_PENDING_SIGNATURE_REQUESTS_PER_ORIGIN = 10;

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
  const boundRequest = await bindPendingBankrCredential(request);
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingSignatureRequests();
    if (requests.some((pending) => pending.id === request.id)) {
      throw new Error("Signature request already exists");
    }
    if (requests.length >= MAX_PENDING_SIGNATURE_REQUESTS) {
      throw new Error("Too many pending signature requests");
    }
    if (
      requests.filter((pending) => pending.origin === request.origin).length >=
      MAX_PENDING_SIGNATURE_REQUESTS_PER_ORIGIN
    ) {
      throw new Error("This site has too many pending signature requests");
    }
    requests.push(boundRequest);
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
