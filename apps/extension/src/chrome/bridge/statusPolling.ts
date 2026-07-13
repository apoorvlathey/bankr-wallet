import type { CompletedTransaction } from "../history/types";
import { getTxById, updateTxInHistory } from "../history/repository";
import {
  addPendingBridge,
  getPendingBridges,
  type PendingBridge,
} from "../requests/pendingBridgeStorage";
import { checkAndApplyBridgeStatus } from "./statusApplication";

export const BRIDGE_INITIAL_INTERVAL_MS = 5_000;
export const BRIDGE_MAX_INTERVAL_MS = 30_000;
export const BRIDGE_BACKOFF_FACTOR = 1.5;
export const BRIDGE_MAX_POLL_DURATION_MS = 15 * 60 * 1000;

const activeBridgePollers = new Set<string>();

export function startBridgeStatusPolling(sourceTxHash: string): void {
  const key = sourceTxHash.toLowerCase();
  if (activeBridgePollers.has(key)) return;
  activeBridgePollers.add(key);
  pollBridgeStatus(sourceTxHash)
    .catch((error) => {
      console.warn("[bridge] poller error", error);
    })
    .finally(() => {
      activeBridgePollers.delete(key);
    });
}

async function pollBridgeStatus(sourceTxHash: string): Promise<void> {
  const startTime = Date.now();
  let interval = BRIDGE_INITIAL_INTERVAL_MS;
  while (Date.now() - startTime < BRIDGE_MAX_POLL_DURATION_MS) {
    await sleep(interval);
    if (await checkAndApplyBridgeStatus(sourceTxHash)) return;
    interval = Math.min(
      interval * BRIDGE_BACKOFF_FACTOR,
      BRIDGE_MAX_INTERVAL_MS,
    );
  }
}

export async function resumePendingBridgePollers(): Promise<void> {
  const bag = await getPendingBridges();
  for (const entry of Object.values(bag)) {
    startBridgeStatusPolling(entry.sourceTxHash);
  }
}

/** Pure compatibility mapping from a confirmed history entry to poll state. */
export function pendingBridgeFromHistory(
  tx: CompletedTransaction | null,
  createdAt: number,
): PendingBridge | null {
  if (!tx?.bridge || !tx.txHash || tx.bridge.destinationTxHash) return null;
  return {
    txId: tx.id,
    sourceTxHash: tx.txHash,
    sourceChainId: tx.bridge.sourceChainId ?? tx.chainId,
    destinationChainId: tx.bridge.destinationChainId,
    destinationChainName: tx.bridge.destinationChainName,
    receiverAddress: tx.bridge.receiverAddress ?? tx.tx.from,
    createdAt,
    requestHash: tx.bridge.requestHash,
    routeName: tx.bridge.routeName,
  };
}

export async function maybeStartBridgePolling(txId: string): Promise<void> {
  const tx = await getTxById(txId);
  if (!tx?.bridge || !tx.txHash || tx.bridge.destinationTxHash) return;
  const pending = pendingBridgeFromHistory(tx, Date.now());
  if (!pending) return;

  await addPendingBridge(pending);
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
