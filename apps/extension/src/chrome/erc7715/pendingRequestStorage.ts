/** Locked repository for pending ERC-7715 approval prompts. */

import { withStorageLock } from "../storageLock";
import { updateErc7715PermissionBadge } from "./permissionBadge";
import type { PendingErc7715PermissionRequest } from "./types";

export const PENDING_ERC7715_PERMISSION_STORAGE_KEY =
  "pendingErc7715PermissionRequests";
export const PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY =
  `local:${PENDING_ERC7715_PERMISSION_STORAGE_KEY}`;

export async function getPendingErc7715PermissionRequests(): Promise<
  PendingErc7715PermissionRequest[]
> {
  const stored = await chrome.storage.local.get(
    PENDING_ERC7715_PERMISSION_STORAGE_KEY,
  );
  return stored[PENDING_ERC7715_PERMISSION_STORAGE_KEY] || [];
}

export async function savePendingErc7715PermissionRequest(
  request: PendingErc7715PermissionRequest,
): Promise<PendingErc7715PermissionRequest[]> {
  const saved = await withStorageLock(
    PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY,
    async () => {
      const requests = await getPendingErc7715PermissionRequests();
      requests.push(request);
      await chrome.storage.local.set({
        [PENDING_ERC7715_PERMISSION_STORAGE_KEY]: requests,
      });
      return requests;
    },
  );
  await updateErc7715PermissionBadge();
  return saved;
}

export async function removePendingErc7715PermissionRequest(
  requestId: string,
): Promise<void> {
  await withStorageLock(
    PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY,
    async () => {
      const requests = await getPendingErc7715PermissionRequests();
      await chrome.storage.local.set({
        [PENDING_ERC7715_PERMISSION_STORAGE_KEY]: requests.filter(
          (request) => request.id !== requestId,
        ),
      });
    },
  );
  await updateErc7715PermissionBadge();
}

export async function getPendingErc7715PermissionRequestById(
  requestId: string,
): Promise<PendingErc7715PermissionRequest | null> {
  const requests = await getPendingErc7715PermissionRequests();
  return requests.find((request) => request.id === requestId) || null;
}
