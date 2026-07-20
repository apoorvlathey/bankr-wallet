/**
 * Persistent storage for pending transaction requests
 * Transactions are stored in chrome.storage.local and survive popup closes
 */

import type { TransactionParams } from "../bankr/submission";
import { bindPendingBankrCredential } from "../bankr/credentialBinding";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { isPendingSafeProposal } from "../safe/proposalStatus";
import { withStorageLock } from "../storageLock";

export interface Erc7715PermissionRevokeMeta {
  grantId: string;
  origin?: string;
  favicon?: string | null;
  permissionType?: string;
  delegate?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  amount?: `0x${string}`;
  periodDuration?: number;
  expiresAt?: number | null;
  approvalRevocationMethods?: string[];
}

export interface TransactionReplacementMeta {
  kind: "speedUp" | "cancel";
  originalTxId: string;
  originalTxHash: string;
  /** Original reviewed action label retained for Speed Up history. */
  originalFunctionName?: string;
  nonce: number;
  /** Lowest values that still clear the original transaction's fee bump. */
  minimumMaxFeePerGas: string;
  minimumMaxPriorityFeePerGas: string;
}

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
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "ledger" | "impersonator";
  /** Non-secret ciphertext-generation binding for Bankr signer requests. */
  bankrCredentialTag?: string;
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  /** Explicit service-worker-authored request; never accepted from a webpage. */
  trustedInternal?: true;
  /** Background-authored replacement intent; content and nonce are immutable. */
  replacement?: TransactionReplacementMeta;
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
  /**
   * ERC-7715 permission grant disable tx. The tx calls DelegationManager
   * `disableDelegation(delegation)`; after a successful receipt, the receipt
   * poller marks the stored grant locally revoked so it stops being returned
   * by `wallet_getGrantedExecutionPermissions`. Extra fields are public
   * display snapshots for the confirmation UI; `grantId` remains the only field
   * required by the receipt path.
   */
  erc7715PermissionRevokeMeta?: Erc7715PermissionRevokeMeta;
}

/**
 * Creation-time shape: pinning fields are REQUIRED. Every new pending
 * request must be constructed with `pinnedTxRequest(account, base)` from
 * ../requests/pinnedRequest`, which guarantees these fields. Impersonator
 * requests may be persisted for review; they remain reject-only unless the
 * exact selected RPC has the trusted-UI developer opt-in, and they never enter
 * a signing path.
 */
export type PinnedTxRequest = PendingTxRequest &
  Required<Pick<PendingTxRequest, "accountId" | "accountAddress" | "accountType">>;

const STORAGE_KEY = "pendingTxRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const MAX_PENDING_TX_REQUESTS = 50;
const MAX_PENDING_TX_REQUESTS_PER_ORIGIN = 10;

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
  request: PinnedTxRequest,
  expectedMasterAuthEpoch?: string,
): Promise<void> {
  const boundRequest = await bindPendingBankrCredential(request);
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingTxRequests();
    if (requests.some((pending) => pending.id === request.id)) {
      throw new Error("Transaction request already exists");
    }
    if (requests.length >= MAX_PENDING_TX_REQUESTS) {
      throw new Error("Too many pending transaction requests");
    }
    if (
      requests.filter((pending) => pending.origin === request.origin).length >=
      MAX_PENDING_TX_REQUESTS_PER_ORIGIN
    ) {
      throw new Error("This site has too many pending transaction requests");
    }
    requests.push(boundRequest);
    if (expectedMasterAuthEpoch) {
      assertCurrentMasterAuthorization(expectedMasterAuthEpoch);
    }
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
 * Update the extension badge with pending request counts.
 *
 * A cross-dapp batch counts as one pending item, even when it contains many
 * staged calls, because the user will handle it with one confirmation.
 */
export async function updateBadge(): Promise<void> {
  const txRequests = await getPendingTxRequests();
  const { getPendingSignatureRequests } = await import("./pendingSignatureStorage");
  const { getPendingBatchTxRequests } = await import("./pendingBatchTxStorage");
  const { getCrossDappBatch } = await import("../crossDappBatch/storage");
  const { getSafeProposals } = await import("../safe/proposalRepository");
  const { getPendingDappConnectionRequests } = await import(
    "./dappPermissionStorage"
  );
  const { getPendingErc7715PermissionRequests } = await import(
    "../pendingErc7715PermissionStorage"
  );
  const sigRequests = await getPendingSignatureRequests();
  const batchRequests = await getPendingBatchTxRequests();
  const permissionRequests = await getPendingErc7715PermissionRequests();
  const crossDappBatch = await getCrossDappBatch();
  const dappConnectionRequests = await getPendingDappConnectionRequests();
  const safeProposals = await getSafeProposals().catch(() => []);
  const safePendingCount = safeProposals.filter(isPendingSafeProposal).length;
  const crossDappBatchCount = crossDappBatch?.entries.length ? 1 : 0;
  const approvalCount =
    txRequests.length +
    sigRequests.length +
    batchRequests.length +
    permissionRequests.length +
    crossDappBatchCount +
    safePendingCount;
  // A connection prompt should make an otherwise-idle extension noticeable,
  // but it must never inflate or obscure the actionable approval count.
  const count = approvalCount || (dappConnectionRequests.length > 0 ? 1 : 0);

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
    if (requests[idx].replacement) {
      throw new Error("Replacement transaction content cannot be changed");
    }
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
