import { withStorageLock } from "./storageLock";

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
const REQUEST_EXPIRY_MS = 5 * 60 * 1000;

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
    const requests = await getPendingDappConnectionRequests();
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
  const now = Date.now();
  await removePendingDappConnectionRequests(
    (request) => now - request.timestamp >= REQUEST_EXPIRY_MS,
  );
}
