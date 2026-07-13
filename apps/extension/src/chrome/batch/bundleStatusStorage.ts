/** Durable ERC-5792 wallet_getCallsStatus repository. */

import type { BundleStatus } from "../erc5792Types";
import { withStorageLock } from "../storageLock";

const STORAGE_KEY = "bundleStatuses";
const MAX_ENTRIES = 100;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const BUNDLE_STATUS_LOCK_KEY = `local:${STORAGE_KEY}`;

export async function getBundleStatuses(): Promise<BundleStatus[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

export async function saveBundleStatus(status: BundleStatus): Promise<void> {
  return withStorageLock(BUNDLE_STATUS_LOCK_KEY, async () => {
    const statuses = await getBundleStatuses();
    statuses.push(status);
    while (statuses.length > MAX_ENTRIES) statuses.shift();
    await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
  });
}

export async function getBundleStatus(
  bundleId: string,
): Promise<BundleStatus | null> {
  const statuses = await getBundleStatuses();
  return statuses.find((status) => status.id === bundleId) || null;
}

export async function updateBundleStatus(
  bundleId: string,
  updates: Partial<BundleStatus>,
): Promise<void> {
  return withStorageLock(BUNDLE_STATUS_LOCK_KEY, async () => {
    const statuses = await getBundleStatuses();
    const index = statuses.findIndex((status) => status.id === bundleId);
    if (index === -1) return;
    statuses[index] = { ...statuses[index], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
  });
}

export async function removeBundleStatus(bundleId: string): Promise<void> {
  return withStorageLock(BUNDLE_STATUS_LOCK_KEY, async () => {
    const statuses = await getBundleStatuses();
    const filtered = statuses.filter((status) => status.id !== bundleId);
    if (filtered.length !== statuses.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    }
  });
}

export async function cleanupOldBundleStatuses(): Promise<void> {
  return withStorageLock(BUNDLE_STATUS_LOCK_KEY, async () => {
    const statuses = await getBundleStatuses();
    const now = Date.now();
    const valid = statuses.filter(
      (status) => now - status.createdAt < RETENTION_MS,
    );
    if (valid.length !== statuses.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: valid });
    }
  });
}
