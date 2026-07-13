/** Locked repository and master-authorized commit boundary for ERC-7715 grants. */

import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import { withStorageLock } from "../storageLock";
import { updateErc7715PermissionBadge } from "./permissionBadge";
import {
  ERC7715_PERMISSION_RESULT_PREFIX,
  type Erc7715PermissionGrant,
  type Erc7715PermissionResult,
} from "./types";
import {
  getPendingErc7715PermissionRequests,
  PENDING_ERC7715_PERMISSION_STORAGE_KEY,
  PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY,
} from "./pendingRequestStorage";

const GRANTS_STORAGE_KEY = "erc7715PermissionGrants";
const GRANTS_STORAGE_LOCK_KEY = `local:${GRANTS_STORAGE_KEY}`;

export async function getErc7715PermissionGrants(): Promise<
  Erc7715PermissionGrant[]
> {
  const stored = await chrome.storage.local.get(GRANTS_STORAGE_KEY);
  return stored[GRANTS_STORAGE_KEY] || [];
}

export async function getErc7715PermissionGrantById(
  grantId: string,
): Promise<Erc7715PermissionGrant | null> {
  const grants = await getErc7715PermissionGrants();
  return grants.find((grant) => grant.id === grantId) || null;
}

export async function saveErc7715PermissionGrant(
  grant: Erc7715PermissionGrant,
  expectedMasterAuthEpoch: string,
): Promise<void> {
  await withStorageLock(GRANTS_STORAGE_LOCK_KEY, async () => {
    const grants = await getErc7715PermissionGrants();
    const next = grants.filter((existing) => existing.id !== grant.id);
    next.push(grant);
    assertCurrentMasterAuthorization(expectedMasterAuthEpoch);
    await chrome.storage.local.set({ [GRANTS_STORAGE_KEY]: next });
  });
}

/** Atomic reusable-capability, prompt-removal, and success-result commit. */
export async function commitErc7715PermissionGrantApproval({
  grant,
  requestId,
  result,
  expectedMasterAuthEpoch,
}: {
  grant: Erc7715PermissionGrant;
  requestId: string;
  result: Extract<Erc7715PermissionResult, { success: true }>;
  expectedMasterAuthEpoch: string;
}): Promise<void> {
  const resultKey = `${ERC7715_PERMISSION_RESULT_PREFIX}${requestId}`;
  await withStorageLock(PENDING_ERC7715_PERMISSION_STORAGE_LOCK_KEY, () =>
    withStorageLock(GRANTS_STORAGE_LOCK_KEY, async () => {
      const [requests, grants] = await Promise.all([
        getPendingErc7715PermissionRequests(),
        getErc7715PermissionGrants(),
      ]);
      if (!requests.some((request) => request.id === requestId)) {
        throw new Error("Permission request is no longer pending");
      }
      const nextGrants = grants.filter(
        (existing) => existing.id !== grant.id,
      );
      nextGrants.push(grant);

      // No await may occur between this epoch check and starting the write.
      assertCurrentMasterAuthorization(expectedMasterAuthEpoch);
      await chrome.storage.local.set({
        [GRANTS_STORAGE_KEY]: nextGrants,
        [PENDING_ERC7715_PERMISSION_STORAGE_KEY]: requests.filter(
          (request) => request.id !== requestId,
        ),
        [resultKey]: { result, timestamp: Date.now() },
      });
    }),
  );
  await updateErc7715PermissionBadge().catch((error) => {
    console.warn("[erc7715] Failed to refresh permission badge", error);
  });
}

export async function getActiveErc7715PermissionGrants({
  origin,
  accountId,
  chainId,
}: {
  origin?: string;
  accountId?: string;
  chainId?: number;
} = {}): Promise<Erc7715PermissionGrant[]> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const grants = await getErc7715PermissionGrants();
  return grants.filter((grant) => {
    if (grant.status !== "active" || grant.revokedAt) return false;
    if (grant.expiresAt !== null && grant.expiresAt <= nowSeconds) return false;
    if (origin && grant.origin !== origin) return false;
    if (accountId && grant.accountId !== accountId) return false;
    if (chainId && grant.chainId !== chainId) return false;
    return true;
  });
}

export async function revokeErc7715PermissionGrant({
  grantId,
  accountId,
}: {
  grantId: string;
  accountId?: string;
}): Promise<Erc7715PermissionGrant> {
  let revoked: Erc7715PermissionGrant | null = null;
  await withStorageLock(GRANTS_STORAGE_LOCK_KEY, async () => {
    const grants = await getErc7715PermissionGrants();
    const next = grants.map((grant) => {
      if (grant.id !== grantId) return grant;
      if (accountId && grant.accountId !== accountId) {
        throw new Error("Permission grant does not belong to this account");
      }
      revoked = {
        ...grant,
        status: "revoked",
        revokedAt: Math.floor(Date.now() / 1000),
      };
      return revoked;
    });
    if (!revoked) throw new Error("Permission grant not found");
    await chrome.storage.local.set({ [GRANTS_STORAGE_KEY]: next });
  });
  if (!revoked) throw new Error("Permission grant not found");
  return revoked;
}
