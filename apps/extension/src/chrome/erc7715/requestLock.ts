import {
  ERC7715_PERMISSION_EXPIRY_MS,
} from "./types";
import { getPendingErc7715PermissionRequests } from "./pendingRequestStorage";

export const ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR =
  "Cannot process requests while a wallet_requestExecutionPermissions request is in process";

let requestExecutionPermissionsInProgress = false;
let pendingStorageLockInitialized = false;
let pendingStorageLockUntil = 0;

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

function updatePendingStorageLockUntil(timestamps: number[]): void {
  const now = Date.now();
  pendingStorageLockUntil = timestamps.reduce((max, timestamp) => {
    if (!Number.isFinite(timestamp)) return max;
    const until = timestamp + ERC7715_PERMISSION_EXPIRY_MS;
    return until > now && until > max ? until : max;
  }, 0);
  pendingStorageLockInitialized = true;
}

export async function refreshErc7715PermissionRequestLockFromStorage(): Promise<void> {
  if (!isChromeStorageAvailable()) {
    pendingStorageLockInitialized = true;
    pendingStorageLockUntil = 0;
    return;
  }

  try {
    const requests = await getPendingErc7715PermissionRequests();
    updatePendingStorageLockUntil(requests.map((request) => request.timestamp));
  } catch (err) {
    console.warn("[erc7715] failed to refresh pending request lock", err);
    // Fail closed for external request gating until the next storage refresh.
    pendingStorageLockInitialized = false;
    pendingStorageLockUntil = 0;
  }
}

export function syncErc7715PermissionRequestLockFromPendingRequests(
  requests: Array<{ timestamp: number }>,
): void {
  updatePendingStorageLockUntil(requests.map((request) => request.timestamp));
}

export function isErc7715PermissionRequestLocked(): boolean {
  if (requestExecutionPermissionsInProgress) return true;
  if (!pendingStorageLockInitialized) return true;
  return Date.now() < pendingStorageLockUntil;
}

export async function runWithErc7715PermissionRequestLock<T>(
  action: () => Promise<T>,
): Promise<T> {
  if (requestExecutionPermissionsInProgress) {
    throw new Error(ERC7715_PERMISSION_REQUEST_IN_PROGRESS_ERROR);
  }

  requestExecutionPermissionsInProgress = true;
  try {
    return await action();
  } finally {
    requestExecutionPermissionsInProgress = false;
  }
}

void refreshErc7715PermissionRequestLockFromStorage();
