/**
 * Bridge status poller.
 *
 * After a cross-chain source-tx confirms, we ask Bungee's `/status` endpoint
 * (every 5s → 30s, 15 min cap) for the destination leg. Once a terminal
 * status code lands, we update the tx-history entry's `bridge` field with the
 * destination tx hash, fire a browser notification, and drop the pending
 * record.
 *
 * Mirrors the in-memory `txReceiptPoller` model: no `chrome.alarms` involved.
 * If the service worker dies mid-poll, `resumePendingBridgePollers()` re-kicks
 * the loop on startup and on the next popup open.
 *
 * Notifications click-through opens the **destination** explorer URL (stored
 * under `notification-<id>` like the receipt poller). When the destination
 * chain has no registry / explorer entry the notification still fires but
 * with no click target.
 */

import { fetchBridgeStatus } from "./bridgeApi";
import {
  addPendingBridge,
  getPendingBridges,
  removePendingBridge,
  updatePendingBridge,
  type PendingBridge,
} from "./pendingBridgeStorage";
import { getTxById, updateTxInHistory } from "./txHistoryStorage";
import { showNotification } from "./txHandlers";
import { getStoredExplorerUrl } from "@/lib/chains";
import {
  BungeeStatusCode,
  TERMINAL_STATUS_CODES,
  type BungeeStatusEntry,
} from "@walletchan/shared/bungee";

const INITIAL_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;
const BACKOFF_FACTOR = 1.5;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;

/** Pollers keyed by source-tx hash so we never run two in parallel for one bridge. */
const activeBridgePollers = new Set<string>();

export function startBridgeStatusPolling(sourceTxHash: string): void {
  const key = sourceTxHash.toLowerCase();
  if (activeBridgePollers.has(key)) return;
  activeBridgePollers.add(key);

  pollBridgeStatus(sourceTxHash)
    .catch((err) => {
      console.warn("[bridge] poller error", err);
    })
    .finally(() => {
      activeBridgePollers.delete(key);
    });
}

async function pollBridgeStatus(sourceTxHash: string): Promise<void> {
  const startTime = Date.now();
  let interval = INITIAL_INTERVAL_MS;

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    await sleep(interval);

    const done = await checkAndApplyStatus(sourceTxHash);
    if (done) return;

    interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL_MS);
  }
  // Timed out — silently stop. The next time the user opens the popup or
  // the SW restarts, the resume hook will pick it up again.
}

/**
 * Read `/status` once and apply terminal updates. Returns true when the
 * entry has reached a terminal state and the poller can exit.
 */
async function checkAndApplyStatus(sourceTxHash: string): Promise<boolean> {
  const bag = await getPendingBridges();
  const entry = bag[sourceTxHash.toLowerCase()];
  if (!entry) return true; // Removed by another path — nothing to poll.

  let statusEntry: BungeeStatusEntry | undefined;
  try {
    const res = await fetchBridgeStatus({ txHash: sourceTxHash });
    statusEntry = res.result?.[0];
  } catch {
    // Network blip — let the backoff loop retry.
    return false;
  }

  if (!statusEntry) {
    await updatePendingBridge(sourceTxHash, { lastPolledAt: Date.now() });
    return false;
  }

  const code = statusEntry.bungeeStatusCode;
  const destTxHash = statusEntry.destinationData?.txHash;
  const refundTxHash = statusEntry.refund?.txHash;
  const requestHash = statusEntry.hash;
  const routeName = statusEntry.routeDetails?.name;

  // Detect first-time arrival of the destination tx-hash so we can kick
  // off the destination-leg asset-changes extraction below (fire once per
  // bridge — re-polls return the same hash and we'd otherwise re-decode).
  const priorEntry = await getTxById(entry.txId);
  const destTxHashNewlyArrived =
    !!destTxHash && !priorEntry?.bridge?.destinationTxHash;

  // Always reflect the latest status into the tx-history entry so the
  // UI can render "Bridging…", "Extracted on source", etc. without
  // waiting for terminal state.
  await updateTxInHistory(entry.txId, {
    bridge: {
      sourceChainId: entry.sourceChainId,
      sourceTxHash: entry.sourceTxHash,
      destinationChainId: entry.destinationChainId,
      destinationChainName: entry.destinationChainName,
      destinationTxHash: destTxHash,
      bungeeStatusCode: code,
      requestHash: requestHash ?? entry.requestHash,
      routeName: routeName ?? entry.routeName,
      receiverAddress: entry.receiverAddress,
      refundTxHash,
    },
  });

  // Once the destination tx lands, fetch its receipt off the dest-chain RPC
  // and extract the receiver's ERC-20 inflows + native delta. Fire-and-
  // forget so a flaky destination RPC can't stall the bridge state machine.
  if (destTxHashNewlyArrived && destTxHash) {
    void (async () => {
      try {
        const { extractAndStoreDestinationAssetChanges } = await import(
          "./assetChangesExtractor"
        );
        await extractAndStoreDestinationAssetChanges({
          txId: entry.txId,
          destChainId: entry.destinationChainId,
          destTxHash,
          receiverAddress: entry.receiverAddress,
        });
      } catch (err) {
        console.warn("[bridge] destination asset-changes failed", err);
      }
    })();
  }

  await updatePendingBridge(sourceTxHash, {
    requestHash: requestHash ?? entry.requestHash,
    bungeeStatusCode: code,
    routeName: routeName ?? entry.routeName,
    lastPolledAt: Date.now(),
  });

  if (!TERMINAL_STATUS_CODES.has(code)) return false;

  await fireTerminalNotification(entry, code, destTxHash, refundTxHash);
  await removePendingBridge(sourceTxHash);
  return true;
}

async function fireTerminalNotification(
  entry: PendingBridge,
  code: BungeeStatusCode,
  destTxHash: string | undefined,
  refundTxHash: string | undefined,
): Promise<void> {
  const isSuccess =
    code === BungeeStatusCode.FULFILLED || code === BungeeStatusCode.SETTLED;
  const isRefunded = code === BungeeStatusCode.REFUNDED;

  const notificationId = isSuccess
    ? `bridge-success-${entry.txId}`
    : `bridge-failed-${entry.txId}`;

  // Pick the explorer for the chain we want the user to land on:
  // success → destination, refund → source, expired/cancelled → source.
  if (isSuccess && destTxHash) {
    const explorer = await getStoredExplorerUrl(entry.destinationChainId);
    if (explorer) {
      await chrome.storage.local.set({
        [`notification-${notificationId}`]: `${explorer}/tx/${destTxHash}`,
      });
    }
  } else if (isRefunded && refundTxHash) {
    const explorer = await getStoredExplorerUrl(entry.sourceChainId);
    if (explorer) {
      await chrome.storage.local.set({
        [`notification-${notificationId}`]: `${explorer}/tx/${refundTxHash}`,
      });
    }
  }

  if (isSuccess) {
    await showNotification(
      notificationId,
      "Bridge Complete",
      `Funds delivered on ${entry.destinationChainName}. Click to view.`,
    );
  } else if (isRefunded) {
    await showNotification(
      notificationId,
      "Bridge Refunded",
      `Bridge to ${entry.destinationChainName} was refunded on source chain. Click to view.`,
    );
  } else if (code === BungeeStatusCode.EXPIRED) {
    await showNotification(
      notificationId,
      "Bridge Expired",
      `Bridge request to ${entry.destinationChainName} expired before settlement.`,
    );
  } else if (code === BungeeStatusCode.CANCELLED) {
    await showNotification(
      notificationId,
      "Bridge Cancelled",
      `Bridge request to ${entry.destinationChainName} was cancelled.`,
    );
  }
}

/**
 * Resume polling for any bridges still in flight. Called from service-worker
 * startup and from popup-open hooks so a long-running bridge eventually fires
 * its notification even if the SW died mid-poll.
 */
export async function resumePendingBridgePollers(): Promise<void> {
  const bag = await getPendingBridges();
  for (const entry of Object.values(bag)) {
    startBridgeStatusPolling(entry.sourceTxHash);
  }
}

/**
 * Called from the source-tx success hook (PK/Seed via `applyReceiptToHistory`,
 * Bankr via `processSwapTxBankr` direct-success path). Reads the tx-history
 * entry's `bridge` meta and — if it represents a not-yet-tracked bridge —
 * registers a `pendingBridge` and kicks off status polling.
 *
 * Idempotent: re-running on the same txId is harmless. The active-poller set
 * dedupes concurrent loops, and `addPendingBridge` overwrites with identical
 * data when called twice.
 */
export async function maybeStartBridgePolling(txId: string): Promise<void> {
  const tx = await getTxById(txId);
  if (!tx?.bridge || !tx.txHash) return;
  if (tx.bridge.destinationTxHash) return; // already settled

  await addPendingBridge({
    txId,
    sourceTxHash: tx.txHash,
    sourceChainId: tx.bridge.sourceChainId ?? tx.chainId,
    destinationChainId: tx.bridge.destinationChainId,
    destinationChainName: tx.bridge.destinationChainName,
    receiverAddress: tx.bridge.receiverAddress ?? tx.tx.from,
    createdAt: Date.now(),
    requestHash: tx.bridge.requestHash,
    routeName: tx.bridge.routeName,
  });

  // Reflect the canonical source-tx-hash back onto the history entry so the
  // tx-detail modal can render the source leg even before /status responds.
  if (tx.bridge.sourceTxHash !== tx.txHash) {
    await updateTxInHistory(txId, {
      bridge: { ...tx.bridge, sourceTxHash: tx.txHash },
    });
  }

  startBridgeStatusPolling(tx.txHash);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
