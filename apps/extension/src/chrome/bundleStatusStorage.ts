/**
 * Bundle status storage for ERC-5792 wallet_getCallsStatus
 * Tracks the lifecycle of batch transaction bundles
 */

import type { BundleStatus } from "./erc5792Types";

const STORAGE_KEY = "bundleStatuses";
const MAX_ENTRIES = 100;
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getBundleStatuses(): Promise<BundleStatus[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

export async function saveBundleStatus(status: BundleStatus): Promise<void> {
  const statuses = await getBundleStatuses();
  statuses.push(status);
  // Evict oldest if over limit
  while (statuses.length > MAX_ENTRIES) {
    statuses.shift();
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
}

export async function getBundleStatus(bundleId: string): Promise<BundleStatus | null> {
  const statuses = await getBundleStatuses();
  return statuses.find((s) => s.id === bundleId) || null;
}

export async function updateBundleStatus(
  bundleId: string,
  updates: Partial<BundleStatus>,
): Promise<void> {
  const statuses = await getBundleStatuses();
  const idx = statuses.findIndex((s) => s.id === bundleId);
  if (idx === -1) return;
  statuses[idx] = { ...statuses[idx], ...updates };
  await chrome.storage.local.set({ [STORAGE_KEY]: statuses });
}

export async function cleanupOldBundleStatuses(): Promise<void> {
  const statuses = await getBundleStatuses();
  const now = Date.now();
  const valid = statuses.filter((s) => now - s.createdAt < RETENTION_MS);
  if (valid.length !== statuses.length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: valid });
  }
}
