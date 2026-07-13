import {
  TERMINAL_STATUS_CODES,
  type BungeeStatusEntry,
} from "@walletchan/shared/bungee";
import {
  getPendingBridges,
  removePendingBridge,
  updatePendingBridge,
  type PendingBridge,
} from "../requests/pendingBridgeStorage";
import { getTxById, updateTxInHistory } from "../history/repository";
import { fetchBridgeStatus } from "./client";
import { fireTerminalBridgeNotification } from "./statusNotification";

/** One bounded status read plus its durable state transition. */
export async function checkAndApplyBridgeStatus(
  sourceTxHash: string,
): Promise<boolean> {
  const bag = await getPendingBridges();
  const entry = bag[sourceTxHash.toLowerCase()];
  if (!entry) return true;

  let statusEntry: BungeeStatusEntry | undefined;
  try {
    const response = await fetchBridgeStatus({
      requestHash: entry.requestHash,
      txHash: sourceTxHash,
    });
    statusEntry = response.result?.[0];
  } catch {
    return false;
  }
  if (!statusEntry) {
    await updatePendingBridge(sourceTxHash, { lastPolledAt: Date.now() });
    return false;
  }
  return applyBridgeStatusEntry(sourceTxHash, entry, statusEntry);
}

/**
 * Applies one Socket status in the released order: history snapshot, optional
 * destination enrichment, pending checkpoint, notification, terminal remove.
 */
export async function applyBridgeStatusEntry(
  sourceTxHash: string,
  entry: PendingBridge,
  statusEntry: BungeeStatusEntry,
): Promise<boolean> {
  const code = statusEntry.bungeeStatusCode;
  const destinationTxHash = statusEntry.destinationData?.txHash;
  const refundTxHash = statusEntry.refund?.txHash;
  const requestHash = statusEntry.hash;
  const routeName = statusEntry.routeDetails?.name;

  const priorHistory = await getTxById(entry.txId);
  const destinationNewlyArrived =
    !!destinationTxHash && !priorHistory?.bridge?.destinationTxHash;

  await updateTxInHistory(entry.txId, {
    bridge: {
      sourceChainId: entry.sourceChainId,
      sourceTxHash: entry.sourceTxHash,
      destinationChainId: entry.destinationChainId,
      destinationChainName: entry.destinationChainName,
      destinationTxHash,
      bungeeStatusCode: code,
      requestHash: requestHash ?? entry.requestHash,
      routeName: routeName ?? entry.routeName,
      receiverAddress: entry.receiverAddress,
      refundTxHash,
    },
  });

  if (destinationNewlyArrived && destinationTxHash) {
    void (async () => {
      try {
        const { extractAndStoreDestinationAssetChanges } = await import(
          "../history/assetChangePersistence"
        );
        await extractAndStoreDestinationAssetChanges({
          txId: entry.txId,
          destChainId: entry.destinationChainId,
          destTxHash: destinationTxHash,
          receiverAddress: entry.receiverAddress,
        });
      } catch (error) {
        console.warn("[bridge] destination asset-changes failed", error);
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

  await fireTerminalBridgeNotification(
    entry,
    code,
    destinationTxHash,
    refundTxHash,
  );
  await removePendingBridge(sourceTxHash);
  return true;
}
