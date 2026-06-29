/**
 * Persistent storage for ERC-7715 delegated permission approval requests and
 * granted ERC-7710 delegation contexts.
 */

import type { Erc7715SupportedPermissionType } from "./erc7715PermissionRegistry";
import type { Erc7715MappedCaveat } from "./erc7715PermissionCaveats";
import { withStorageLock } from "./storageLock";

export type Hex = `0x${string}`;
export type Address = Hex;

export type Erc7715PermissionRequest = {
  chainId: Hex;
  from: Address;
  to: Address;
  permission: {
    type: Erc7715SupportedPermissionType;
    isAdjustmentAllowed: boolean;
    justification?: string;
    data: Record<string, unknown>;
  };
  rules?: {
    type: string;
    data: Record<string, unknown>;
  }[];
};

export type Erc7715PermissionResponse = Erc7715PermissionRequest & {
  context: Hex;
  dependencies: { factory: Hex; factoryData: Hex }[];
  delegationManager: Address;
};

export type Erc7710Delegation = {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: {
    enforcer: Address;
    terms: Hex;
    args: Hex;
  }[];
  salt: Hex;
  signature: Hex;
};

export type Erc7710DelegationTypedData = {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "Delegation";
  domain: {
    name: "DelegationManager";
    version: "1";
    chainId: number;
    verifyingContract: Address;
  };
  message: {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: {
      enforcer: Address;
      terms: Hex;
    }[];
    salt: string;
  };
};

export interface PendingErc7715PermissionRequest {
  id: string;
  origin: string;
  favicon: string | null;
  timestamp: number;
  chainName: string;
  chainId: number;
  request: Erc7715PermissionRequest;
  permissionType: Erc7715SupportedPermissionType;
  caveats: Erc7715MappedCaveat[];
  accountId: string;
  accountAddress: string;
  accountType: "privateKey" | "seedPhrase";
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
}

export interface Erc7715PermissionGrant {
  id: string;
  origin: string;
  favicon: string | null;
  senderOrigin?: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt?: number;
  status: "active" | "revoked";
  accountId: string;
  accountAddress: string;
  accountType: "privateKey" | "seedPhrase";
  chainId: number;
  chainName: string;
  permissionType: Erc7715SupportedPermissionType;
  request: Erc7715PermissionRequest;
  response: Erc7715PermissionResponse;
  caveats: Erc7715MappedCaveat[];
  delegation: Erc7710Delegation;
  typedData: Erc7710DelegationTypedData;
  contextHash: Hex;
}

export type Erc7715PermissionResult =
  | { success: true; result: Erc7715PermissionResponse[] }
  | { success: false; error: string };

const PENDING_STORAGE_KEY = "pendingErc7715PermissionRequests";
const GRANTS_STORAGE_KEY = "erc7715PermissionGrants";
const PENDING_STORAGE_LOCK_KEY = `local:${PENDING_STORAGE_KEY}`;
const GRANTS_STORAGE_LOCK_KEY = `local:${GRANTS_STORAGE_KEY}`;
export const ERC7715_PERMISSION_RESULT_PREFIX = "erc7715PermissionResult:";
const ERC7715_PERMISSION_RESULT_TIMEOUT_MS = 5 * 60 * 1000;
export const ERC7715_PERMISSION_EXPIRY_MS = ERC7715_PERMISSION_RESULT_TIMEOUT_MS;

export async function getPendingErc7715PermissionRequests(): Promise<
  PendingErc7715PermissionRequest[]
> {
  const { pendingErc7715PermissionRequests } =
    (await chrome.storage.local.get(PENDING_STORAGE_KEY)) as {
      pendingErc7715PermissionRequests?: PendingErc7715PermissionRequest[];
    };
  return pendingErc7715PermissionRequests || [];
}

export async function savePendingErc7715PermissionRequest(
  request: PendingErc7715PermissionRequest,
): Promise<PendingErc7715PermissionRequest[]> {
  const savedRequests = await withStorageLock(PENDING_STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingErc7715PermissionRequests();
    requests.push(request);
    await chrome.storage.local.set({ [PENDING_STORAGE_KEY]: requests });
    return requests;
  });
  await updateErc7715PermissionBadge();
  return savedRequests;
}

export async function removePendingErc7715PermissionRequest(
  requestId: string,
): Promise<void> {
  await withStorageLock(PENDING_STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingErc7715PermissionRequests();
    const filtered = requests.filter((request) => request.id !== requestId);
    await chrome.storage.local.set({ [PENDING_STORAGE_KEY]: filtered });
  });
  await updateErc7715PermissionBadge();
}

export async function getPendingErc7715PermissionRequestById(
  requestId: string,
): Promise<PendingErc7715PermissionRequest | null> {
  const requests = await getPendingErc7715PermissionRequests();
  return requests.find((request) => request.id === requestId) || null;
}

export async function clearExpiredErc7715PermissionRequests(): Promise<void> {
  let changed = false;
  const expiredIds: string[] = [];
  await withStorageLock(PENDING_STORAGE_LOCK_KEY, async () => {
    const requests = await getPendingErc7715PermissionRequests();
    const now = Date.now();
    const valid = requests.filter((request) => {
      const keep = now - request.timestamp < ERC7715_PERMISSION_EXPIRY_MS;
      if (!keep) expiredIds.push(request.id);
      return keep;
    });
    if (valid.length !== requests.length) {
      await chrome.storage.local.set({ [PENDING_STORAGE_KEY]: valid });
      changed = true;
    }
  });
  if (changed) {
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
}

export async function getErc7715PermissionGrants(): Promise<
  Erc7715PermissionGrant[]
> {
  const { erc7715PermissionGrants } =
    (await chrome.storage.local.get(GRANTS_STORAGE_KEY)) as {
      erc7715PermissionGrants?: Erc7715PermissionGrant[];
    };
  return erc7715PermissionGrants || [];
}

export async function getErc7715PermissionGrantById(
  grantId: string,
): Promise<Erc7715PermissionGrant | null> {
  const grants = await getErc7715PermissionGrants();
  return grants.find((grant) => grant.id === grantId) || null;
}

export async function saveErc7715PermissionGrant(
  grant: Erc7715PermissionGrant,
): Promise<void> {
  await withStorageLock(GRANTS_STORAGE_LOCK_KEY, async () => {
    const grants = await getErc7715PermissionGrants();
    const filtered = grants.filter((existing) => existing.id !== grant.id);
    filtered.push(grant);
    await chrome.storage.local.set({ [GRANTS_STORAGE_KEY]: filtered });
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
    if (grant.expiresAt !== null && grant.expiresAt <= nowSeconds) {
      return false;
    }
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

    if (!revoked) {
      throw new Error("Permission grant not found");
    }

    await chrome.storage.local.set({ [GRANTS_STORAGE_KEY]: next });
  });

  if (!revoked) {
    throw new Error("Permission grant not found");
  }

  return revoked;
}

export async function writeErc7715PermissionResult(
  requestId: string,
  result: Erc7715PermissionResult,
): Promise<void> {
  const key = `${ERC7715_PERMISSION_RESULT_PREFIX}${requestId}`;
  await chrome.storage.local.set({
    [key]: {
      result,
      timestamp: Date.now(),
    },
  });
  try {
    const { completeWalletConnectRequestIfNeeded } = await import(
      "./walletConnectHandlers"
    );
    await completeWalletConnectRequestIfNeeded(key, result);
  } catch (error) {
    console.warn("[WalletConnect] ERC-7715 result bridge failed", error);
  }
}

export async function waitForErc7715PermissionResult(
  requestId: string,
): Promise<Erc7715PermissionResult> {
  const key = `${ERC7715_PERMISSION_RESULT_PREFIX}${requestId}`;

  const existing = (await chrome.storage.local.get(key)) as Record<
    string,
    { result?: Erc7715PermissionResult } | undefined
  >;
  if (existing[key]?.result) {
    await chrome.storage.local.remove(key);
    return existing[key].result;
  }

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      chrome.storage.onChanged.removeListener(listener);
      globalThis.clearTimeout(timeout);
    };

    const finish = async (result: Erc7715PermissionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      await chrome.storage.local.remove(key);
      resolve(result);
    };

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[key]?.newValue?.result) return;
      void finish(changes[key].newValue.result as Erc7715PermissionResult);
    };

    const timeout = globalThis.setTimeout(() => {
      void (async () => {
        await removePendingErc7715PermissionRequest(requestId);
        await finish({
          success: false,
          error: "wallet_requestExecutionPermissions timeout",
        });
      })();
    }, ERC7715_PERMISSION_RESULT_TIMEOUT_MS);

    chrome.storage.onChanged.addListener(listener);
  });
}

async function updateErc7715PermissionBadge(): Promise<void> {
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}
