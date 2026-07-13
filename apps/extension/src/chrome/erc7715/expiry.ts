/** Periodic expiry that cannot overtake a claimed confirmation. */

import { isErc7715PermissionResolutionInFlight } from "./resolution";
import { updateErc7715PermissionBadge } from "./permissionBadge";
import { writeErc7715PermissionResult } from "./resultStorage";
import { ERC7715_PERMISSION_EXPIRY_MS } from "./types";
import {
  getPendingErc7715PermissionRequests,
  PENDING_ERC7715_PERMISSION_STORAGE_KEY,
  PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY,
} from "./pendingRequestStorage";
import { withStorageLock } from "../storageLock";

export async function clearExpiredErc7715PermissionRequests(): Promise<void> {
  let changed = false;
  const expiredIds: string[] = [];
  await withStorageLock(
    PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY,
    async () => {
      const requests = await getPendingErc7715PermissionRequests();
      const now = Date.now();
      const valid = requests.filter((request) => {
        if (isErc7715PermissionResolutionInFlight(request.id)) return true;
        const keep = now - request.timestamp < ERC7715_PERMISSION_EXPIRY_MS;
        if (!keep) expiredIds.push(request.id);
        return keep;
      });
      if (valid.length !== requests.length) {
        await chrome.storage.local.set({
          [PENDING_ERC7715_PERMISSION_STORAGE_KEY]: valid,
        });
        changed = true;
      }
    },
  );
  if (!changed) return;
  await Promise.all(
    expiredIds.map((requestId) =>
      writeErc7715PermissionResult(requestId, {
        success: false,
        error: "wallet_requestExecutionPermissions timeout",
      }),
    ),
  );
  await updateErc7715PermissionBadge();
}
