/**
 * Bundle status storage for ERC-5792 wallet_getCallsStatus
 * Tracks the lifecycle of batch transaction bundles
 */

import type { BundleStatus } from "./erc5792Types";

const STORAGE_KEY = "bundleStatuses";
const MAX_ENTRIES = 100;
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Serialize writes to the single bundleStatuses array.
 *
 * Chrome storage updates are read-modify-write operations here. Cross-dapp
 * batches can terminal-update multiple source wallet_sendCalls bundle IDs in
 * parallel; without a write lock, two updates can read the same old array and
 * the later write clobbers the earlier bundle back to PENDING.
 */
let bundleStatusWriteLock: Promise<unknown> = Promise.resolve();

function withBundleStatusLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = bundleStatusWriteLock.then(fn, fn);
  bundleStatusWriteLock = next.catch(() => undefined);
  return next;
}

export async function getBundleStatuses(): Promise<BundleStatus[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

export async function saveBundleStatus(status: BundleStatus): Promise<void> {
  return withBundleStatusLock(async () => {
    const statuses = await getBundleStatuses();
    statuses.push(status);
    // Evict oldest if over limit
    while (statuses.length > MAX_ENTRIES) {
      statuses.shift();
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
  });
}

export async function getBundleStatus(bundleId: string): Promise<BundleStatus | null> {
  const statuses = await getBundleStatuses();
  return statuses.find((s) => s.id === bundleId) || null;
}

export async function updateBundleStatus(
  bundleId: string,
  updates: Partial<BundleStatus>,
): Promise<void> {
  return withBundleStatusLock(async () => {
    const statuses = await getBundleStatuses();
    const idx = statuses.findIndex((s) => s.id === bundleId);
    if (idx === -1) return;
    statuses[idx] = { ...statuses[idx], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
  });
}

export async function cleanupOldBundleStatuses(): Promise<void> {
  return withBundleStatusLock(async () => {
    const statuses = await getBundleStatuses();
    const now = Date.now();
    const valid = statuses.filter((s) => now - s.createdAt < RETENTION_MS);
    if (valid.length !== statuses.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: valid });
    }
  });
}
