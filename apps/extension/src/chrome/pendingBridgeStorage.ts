/**
 * Pending bridge storage.
 *
 * Keyed by the source-chain tx hash because that's the canonical handle we
 * always have post-broadcast (request hash sometimes lags). Each entry tracks
 * what we need to keep polling `/status` for the destination leg and to
 * surface a final notification, even across service-worker restarts.
 *
 * Storage key: `pendingBridges` in `chrome.storage.local`.
 *
 * Schema is additive and self-cleaning — terminal entries are removed by the
 * poller. Stale entries (over 1 hour without progress) are pruned on resume.
 */

import type { BungeeStatusCode } from "@walletchan/shared/bungee";

export interface PendingBridge {
  /** The tx-history entry id this bridge maps to. */
  txId: string;
  /** Source-chain tx hash (the canonical key). */
  sourceTxHash: string;
  sourceChainId: number;
  destinationChainId: number;
  destinationChainName: string;
  /** Address that should receive the destination tokens. */
  receiverAddress: string;
  /** When we first added this entry. */
  createdAt: number;
  /** Bungee request hash, learned once /status returns it. */
  requestHash?: string;
  /** Latest status code we have seen. */
  bungeeStatusCode?: BungeeStatusCode;
  /** When the poller last successfully read /status. */
  lastPolledAt?: number;
  /** Cosmetic — Bungee route name. */
  routeName?: string;
}

const PENDING_BRIDGES_KEY = "pendingBridges";
const STALE_PRUNE_AGE_MS = 60 * 60 * 1000;

/** Serialize writes to the bag so concurrent updates don't clobber each other. */
let writeLock: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.catch(() => undefined);
  return next;
}

export async function getPendingBridges(): Promise<Record<string, PendingBridge>> {
  const data = await chrome.storage.local.get(PENDING_BRIDGES_KEY);
  return (data[PENDING_BRIDGES_KEY] as Record<string, PendingBridge>) ?? {};
}

export async function addPendingBridge(entry: PendingBridge): Promise<void> {
  await withWriteLock(async () => {
    const bag = await getPendingBridges();
    bag[entry.sourceTxHash.toLowerCase()] = entry;
    await chrome.storage.local.set({ [PENDING_BRIDGES_KEY]: bag });
  });
}

export async function updatePendingBridge(
  sourceTxHash: string,
  updates: Partial<PendingBridge>,
): Promise<void> {
  await withWriteLock(async () => {
    const bag = await getPendingBridges();
    const key = sourceTxHash.toLowerCase();
    const existing = bag[key];
    if (!existing) return;
    bag[key] = { ...existing, ...updates };
    await chrome.storage.local.set({ [PENDING_BRIDGES_KEY]: bag });
  });
}

export async function removePendingBridge(sourceTxHash: string): Promise<void> {
  await withWriteLock(async () => {
    const bag = await getPendingBridges();
    delete bag[sourceTxHash.toLowerCase()];
    await chrome.storage.local.set({ [PENDING_BRIDGES_KEY]: bag });
  });
}

/** Drop entries older than 1h that never reached a terminal state. */
export async function prunePendingBridges(): Promise<void> {
  await withWriteLock(async () => {
    const bag = await getPendingBridges();
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(bag)) {
      if (now - v.createdAt > STALE_PRUNE_AGE_MS) {
        delete bag[k];
        changed = true;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ [PENDING_BRIDGES_KEY]: bag });
    }
  });
}
