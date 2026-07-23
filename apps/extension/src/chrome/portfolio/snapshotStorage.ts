/**
 * Portfolio Snapshot Storage
 * Records totalValueUsd snapshots per address for future holdings chart.
 */

interface HoldingsSnapshot {
  timestamp: number; // Unix ms
  totalValueUsd: number;
}

interface SnapshotStore {
  [address: string]: HoldingsSnapshot[];
}

const STORAGE_KEY = "portfolioSnapshotsV2";
const LEGACY_STORAGE_KEY = "portfolioSnapshots";
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000; // 8 days

async function purgeLegacySnapshots(): Promise<void> {
  try {
    await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
  } catch {
    // Chart history cleanup is best-effort and must not block live holdings.
  }
}

/**
 * Record a portfolio value snapshot for an address.
 * Skips if the last snapshot is less than 1 hour old.
 * Prunes entries older than 8 days.
 */
export async function recordSnapshot(
  address: string,
  totalValueUsd: number,
  options: { force?: boolean } = {},
): Promise<boolean> {
  if (!Number.isFinite(totalValueUsd) || totalValueUsd < 0) return false;
  // V1 totals may contain Tempo's eth_getBalance sentinel. They cannot be
  // repaired because snapshots do not retain a per-chain/token breakdown.
  await purgeLegacySnapshots();
  const key = address.toLowerCase();
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const store: SnapshotStore = data[STORAGE_KEY] || {};
  const snapshots = store[key] || [];

  const now = Date.now();

  // Skip if last snapshot is too recent
  if (!options.force && snapshots.length > 0) {
    const last = snapshots[snapshots.length - 1];
    if (now - last.timestamp < MIN_INTERVAL_MS) return false;
  }

  // Prune entries older than 8 days
  const cutoff = now - MAX_AGE_MS;
  const pruned = snapshots.filter((s) => s.timestamp >= cutoff);
  pruned.push({ timestamp: now, totalValueUsd });

  store[key] = pruned;
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
  return true;
}

/**
 * Get all snapshots for an address (for future chart consumption).
 */
export async function getSnapshots(
  address: string
): Promise<HoldingsSnapshot[]> {
  await purgeLegacySnapshots();
  const key = address.toLowerCase();
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const store: SnapshotStore = data[STORAGE_KEY] || {};
  return store[key] || [];
}
