import { withStorageLock } from "../storageLock";

const STORAGE_KEY = "safeSyncState";
const LOCK_KEY = "walletchan:safe-sync";
const MAX_MARKERS = 1_000;

export async function claimSafeNotification(marker: string): Promise<boolean> {
  if (!marker || marker.length > 512) throw new Error("Invalid Safe notification marker");
  return withStorageLock(LOCK_KEY, async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    const current = raw && typeof raw === "object" && !Array.isArray(raw) && (raw as any).version === 1
      ? raw as { version: 1; lastSuccessfulSync?: Record<string, number>; notificationMarkers?: Record<string, number> }
      : { version: 1 as const, lastSuccessfulSync: {}, notificationMarkers: {} };
    const markers = current.notificationMarkers && typeof current.notificationMarkers === "object" && !Array.isArray(current.notificationMarkers)
      ? current.notificationMarkers
      : {};
    if (markers[marker]) return false;
    const entries = Object.entries({ ...markers, [marker]: Date.now() })
      .filter(([key, value]) => key.length <= 512 && Number.isSafeInteger(value) && value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MARKERS);
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        version: 1,
        lastSuccessfulSync: current.lastSuccessfulSync || {},
        notificationMarkers: Object.fromEntries(entries),
      },
    });
    return true;
  });
}

export async function notifySafeExecutionResult(input: {
  proposalId: string;
  state: "executed" | "failed" | "replaced" | "cancelled";
}) {
  if (!(await claimSafeNotification(`${input.proposalId}:execution:${input.state}`))) return;
  const copy = input.state === "executed"
    ? { title: "Safe transaction executed", message: "A Safe proposal was executed onchain." }
    : input.state === "failed"
      ? { title: "Safe execution failed", message: "A Safe execution reverted onchain." }
      : input.state === "cancelled"
        ? { title: "Safe transaction rejected", message: "The rejection transaction executed onchain." }
        : { title: "Safe proposal replaced", message: "Another proposal at the same Safe nonce executed." };
  try {
    await chrome.notifications.create(`safe-execution-${input.state}-${input.proposalId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      ...copy,
    });
  } catch { /* Notifications are best effort. */ }
}
