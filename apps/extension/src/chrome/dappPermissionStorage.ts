import { withStorageLock } from "./storageLock";
import { runPendingRequestResolution } from "./pendingRequestResolution";

export interface DappPermission {
  origin: string;
  hostname: string;
  title?: string;
  favicon?: string | null;
  approvedAt: number;
  lastConnectedAt: number;
}

export interface PendingDappConnectionRequest {
  id: string;
  origin: string;
  hostname: string;
  title?: string;
  favicon?: string | null;
  tabId?: number;
  frameId?: number;
  timestamp: number;
}

const PERMISSIONS_KEY = "dappPermissions";
const PENDING_KEY = "pendingDappConnectionRequests";
const PERMISSIONS_LOCK = `local:${PERMISSIONS_KEY}`;
const PENDING_LOCK = `local:${PENDING_KEY}`;
export const DAPP_CONNECTION_REQUEST_EXPIRY_MS = 5 * 60 * 1000;
export const DAPP_CONNECTION_TIMEOUT_ERROR = "Connection request timed out";
const MAX_PENDING_CONNECTION_REQUESTS = 20;
// One exact origin cannot monopolize the global prompt queue by issuing many
// concurrent eth_requestAccounts calls. EIP-1193 callers should await the
// outstanding request before trying again.
const MAX_PENDING_CONNECTION_REQUESTS_PER_ORIGIN = 1;

async function updatePendingRequestBadge(): Promise<void> {
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export function normalizeDappOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export async function getDappPermissions(): Promise<Record<string, DappPermission>> {
  const stored = await chrome.storage.local.get(PERMISSIONS_KEY);
  return (stored[PERMISSIONS_KEY] as Record<string, DappPermission> | undefined) || {};
}

export async function getDappPermission(
  origin: string,
): Promise<DappPermission | null> {
  const normalized = normalizeDappOrigin(origin);
  if (!normalized) return null;
  return (await getDappPermissions())[normalized] || null;
}

export async function grantDappPermission(
  request: PendingDappConnectionRequest,
): Promise<DappPermission> {
  return withStorageLock(PERMISSIONS_LOCK, async () => {
    const permissions = await getDappPermissions();
    const now = Date.now();
    const previous = permissions[request.origin];
    const permission: DappPermission = {
      origin: request.origin,
      hostname: request.hostname,
      title: request.title || previous?.title,
      favicon: request.favicon || previous?.favicon || null,
      approvedAt: previous?.approvedAt || now,
      lastConnectedAt: now,
    };
    permissions[request.origin] = permission;
    await chrome.storage.local.set({ [PERMISSIONS_KEY]: permissions });
    return permission;
  });
}

export async function touchDappPermission(
  origin: string,
  metadata: Pick<PendingDappConnectionRequest, "title" | "favicon"> = {},
): Promise<void> {
  await withStorageLock(PERMISSIONS_LOCK, async () => {
    const permissions = await getDappPermissions();
    const permission = permissions[origin];
    if (!permission) return;
    permissions[origin] = {
      ...permission,
      title: metadata.title || permission.title,
      favicon: metadata.favicon || permission.favicon || null,
      lastConnectedAt: Date.now(),
    };
    await chrome.storage.local.set({ [PERMISSIONS_KEY]: permissions });
  });
}

export async function revokeDappPermission(origin: string): Promise<boolean> {
  const normalized = normalizeDappOrigin(origin);
  if (!normalized) return false;
  return withStorageLock(PERMISSIONS_LOCK, async () => {
    const permissions = await getDappPermissions();
    if (!permissions[normalized]) return false;
    delete permissions[normalized];
    await chrome.storage.local.set({ [PERMISSIONS_KEY]: permissions });
    return true;
  });
}

export async function getPendingDappConnectionRequests(): Promise<
  PendingDappConnectionRequest[]
> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  return (stored[PENDING_KEY] as PendingDappConnectionRequest[] | undefined) || [];
}

export async function savePendingDappConnectionRequest(
  request: PendingDappConnectionRequest,
): Promise<void> {
  await withStorageLock(PENDING_LOCK, async () => {
    const now = Date.now();
    const requests = (await getPendingDappConnectionRequests()).filter(
      (pending) =>
        now - pending.timestamp < DAPP_CONNECTION_REQUEST_EXPIRY_MS,
    );
    if (requests.some((pending) => pending.id === request.id)) {
      throw new Error("Connection request already exists");
    }
    if (requests.length >= MAX_PENDING_CONNECTION_REQUESTS) {
      throw new Error("Too many pending connection requests");
    }
    if (
      requests.filter((pending) => pending.origin === request.origin).length >=
      MAX_PENDING_CONNECTION_REQUESTS_PER_ORIGIN
    ) {
      throw new Error("This site already has a pending connection request");
    }
    requests.push(request);
    await chrome.storage.local.set({ [PENDING_KEY]: requests });
  });
  await updatePendingRequestBadge();
}

export async function removePendingDappConnectionRequests(
  predicate: (request: PendingDappConnectionRequest) => boolean,
): Promise<PendingDappConnectionRequest[]> {
  const removed = await withStorageLock(PENDING_LOCK, async () => {
    const requests = await getPendingDappConnectionRequests();
    const removed = requests.filter(predicate);
    if (removed.length > 0) {
      await chrome.storage.local.set({
        [PENDING_KEY]: requests.filter((request) => !predicate(request)),
      });
    }
    return removed;
  });
  if (removed.length > 0) await updatePendingRequestBadge();
  return removed;
}

export async function clearExpiredDappConnectionRequests(): Promise<void> {
  await runPendingRequestResolution({
    family: "dappConnection",
    requestId: "all",
    action: "expire",
    conflictResult: () => undefined,
    resolve: async () => {
      const now = Date.now();
      const expired = await removePendingDappConnectionRequests(
        (request) =>
          now - request.timestamp >= DAPP_CONNECTION_REQUEST_EXPIRY_MS,
      );
      await Promise.all(
        expired.map((request) =>
          chrome.storage.local.set({
            [`dappConnectionResult:${request.id}`]: {
              result: {
                success: false,
                error: DAPP_CONNECTION_TIMEOUT_ERROR,
                code: -32000,
              },
              timestamp: Date.now(),
            },
          }),
        ),
      );
    },
  });
}
