/**
 * Persistent storage for pending batch transaction requests (ERC-5792)
 * Mirrors pendingTxStorage.ts pattern
 */

import type { PendingBatchTxRequest, PinnedBatchTxRequest } from "../erc5792Types";
import { bindPendingBankrCredential } from "../bankr/credentialBinding";
import { withStorageLock } from "../storageLock";

const STORAGE_KEY = "pendingBatchTxRequests";
const STORAGE_LOCK_KEY = `local:${STORAGE_KEY}`;
const MAX_PENDING_BATCH_REQUESTS = 20;
const MAX_PENDING_BATCH_REQUESTS_PER_ORIGIN = 5;

/** Bind before intake authorization so Bankr rows are never validated untagged. */
export function bindPendingBatchTxRequestCredential(
  request: PinnedBatchTxRequest,
): Promise<PinnedBatchTxRequest> {
  return bindPendingBankrCredential(request);
}

export async function getPendingBatchTxRequests(): Promise<PendingBatchTxRequest[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

export async function savePendingBatchTxRequest(
  request: PinnedBatchTxRequest,
): Promise<void> {
  const boundRequest = await bindPendingBatchTxRequestCredential(request);
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    if (requests.some((pending) => pending.id === request.id)) {
      throw new Error("Batch request already exists");
    }
    if (requests.length >= MAX_PENDING_BATCH_REQUESTS) {
      throw new Error("Too many pending batch requests");
    }
    if (
      requests.filter((pending) => pending.origin === request.origin).length >=
      MAX_PENDING_BATCH_REQUESTS_PER_ORIGIN
    ) {
      throw new Error("This site has too many pending batch requests");
    }
    requests.push(boundRequest);
    await chrome.storage.local.set({ [STORAGE_KEY]: requests });
  });
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export async function removePendingBatchTxRequest(bundleId: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    const filtered = requests.filter((r) => r.id !== bundleId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export async function getPendingBatchTxRequestById(
  bundleId: string,
): Promise<PendingBatchTxRequest | null> {
  const requests = await getPendingBatchTxRequests();
  return requests.find((r) => r.id === bundleId) || null;
}

/**
 * Publish the final actionable snapshot after intake validation succeeds.
 * Returning null makes a concurrent removal/rejection fail closed instead of
 * recreating a request that another surface already resolved.
 */
export async function markPendingBatchTxRequestReady(
  bundleId: string,
): Promise<PendingBatchTxRequest | null> {
  return withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    const index = requests.findIndex((request) => request.id === bundleId);
    if (index === -1 || requests[index].intakeStatus !== "validating") {
      return null;
    }

    const readyRequest = { ...requests[index] };
    delete readyRequest.intakeStatus;
    const next = [...requests];
    next[index] = readyRequest;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return readyRequest;
  });
}

/**
 * Replace one call's `data` field in a pending batch request. Used by the
 * batch confirmation UI when the user edits a built-in field (e.g. an ERC-20
 * approve amount) — we re-encode that call's calldata and persist it back so
 * the downstream sign paths (Bankr ERC-7821, PK/Seed auto-sequential, and any
 * future EIP-7702 atomic path) read the edited value at sign time without any
 * per-handler plumbing. Simulation + gas re-run automatically because the
 * popup's storage listener re-pushes the updated PendingBatchTxRequest into
 * BatchTransactionConfirmation, whose synthetic batch tx is memoized on
 * `params.calls`.
 */
export async function updateCallInPendingBatchTxRequest(
  bundleId: string,
  callIndex: number,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  return withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    const idx = requests.findIndex((r) => r.id === bundleId);
    if (idx === -1) return { success: false, error: "Batch not found" };

    const target = requests[idx];
    if (target.privacyRagequitMeta) {
      return { success: false, error: "Public exit calls cannot be changed" };
    }
    if (target.intakeStatus === "validating") {
      return { success: false, error: "Batch request is still being validated" };
    }
    const calls = target.params.calls ?? [];
    if (callIndex < 0 || callIndex >= calls.length) {
      return { success: false, error: "Call index out of range" };
    }
    if (!/^0x[0-9a-fA-F]*$/.test(newData)) {
      return { success: false, error: "Invalid calldata hex" };
    }

    const nextCalls = calls.map((c, i) =>
      i === callIndex ? { ...c, data: newData as `0x${string}` } : c,
    );
    const updated: PendingBatchTxRequest = {
      ...target,
      params: { ...target.params, calls: nextCalls },
    };
    const next = [...requests];
    next[idx] = updated;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return { success: true };
  });
}

/**
 * Remove a single call from a pending batch request's `params.calls` array.
 * Returns the remaining call count (0 means the caller should drop the bundle
 * entirely — an empty batch is meaningless and we never want to ship one).
 */
export async function removeCallFromPendingBatchTxRequest(
  bundleId: string,
  callIndex: number,
): Promise<{ found: boolean; remainingCalls: number; error?: string }> {
  return withStorageLock(STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingBatchTxRequests();
    const idx = requests.findIndex((r) => r.id === bundleId);
    if (idx === -1) return { found: false, remainingCalls: 0 };

    const target = requests[idx];
    if (target.privacyRagequitMeta) {
      return {
        found: true,
        remainingCalls: target.params.calls?.length ?? 0,
        error: "Public exit calls cannot be changed",
      };
    }
    if (target.intakeStatus === "validating") {
      return {
        found: true,
        remainingCalls: target.params.calls?.length ?? 0,
        error: "Batch request is still being validated",
      };
    }
    const calls = target.params.calls ?? [];
    if (callIndex < 0 || callIndex >= calls.length) {
      return { found: true, remainingCalls: calls.length };
    }

    const nextCalls = calls.filter((_, i) => i !== callIndex);
    const updated: PendingBatchTxRequest = {
      ...target,
      params: { ...target.params, calls: nextCalls },
    };
    const next = [...requests];
    next[idx] = updated;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return { found: true, remainingCalls: nextCalls.length };
  });
}
