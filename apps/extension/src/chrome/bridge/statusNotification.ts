import { getStoredExplorerUrl } from "@/lib/chains";
import { BungeeStatusCode } from "@walletchan/shared/bungee";
import { showNotification } from "../transactions/notification";
import type { PendingBridge } from "../requests/pendingBridgeStorage";

export interface BridgeTerminalNotification {
  notificationId: string;
  title: string;
  message: string;
  explorerChainId?: number;
  explorerTxHash?: string;
}

/** Pure terminal-code mapping; strings are part of the released UX contract. */
export function describeBridgeTerminalNotification(
  entry: PendingBridge,
  code: BungeeStatusCode,
  destinationTxHash?: string,
  refundTxHash?: string,
): BridgeTerminalNotification | null {
  const isSuccess =
    code === BungeeStatusCode.FULFILLED || code === BungeeStatusCode.SETTLED;
  if (isSuccess) {
    return {
      notificationId: `bridge-success-${entry.txId}`,
      title: "Bridge Complete",
      message: `Funds delivered on ${entry.destinationChainName}. Click to view.`,
      explorerChainId: destinationTxHash
        ? entry.destinationChainId
        : undefined,
      explorerTxHash: destinationTxHash,
    };
  }
  const notificationId = `bridge-failed-${entry.txId}`;
  if (code === BungeeStatusCode.REFUNDED) {
    return {
      notificationId,
      title: "Bridge Refunded",
      message: `Bridge to ${entry.destinationChainName} was refunded on source chain. Click to view.`,
      explorerChainId: refundTxHash ? entry.sourceChainId : undefined,
      explorerTxHash: refundTxHash,
    };
  }
  if (code === BungeeStatusCode.EXPIRED) {
    return {
      notificationId,
      title: "Bridge Expired",
      message: `Bridge request to ${entry.destinationChainName} expired before settlement.`,
    };
  }
  if (code === BungeeStatusCode.CANCELLED) {
    return {
      notificationId,
      title: "Bridge Cancelled",
      message: `Bridge request to ${entry.destinationChainName} was cancelled.`,
    };
  }
  return null;
}

export async function fireTerminalBridgeNotification(
  entry: PendingBridge,
  code: BungeeStatusCode,
  destinationTxHash?: string,
  refundTxHash?: string,
): Promise<void> {
  const notification = describeBridgeTerminalNotification(
    entry,
    code,
    destinationTxHash,
    refundTxHash,
  );
  if (!notification) return;

  if (notification.explorerChainId && notification.explorerTxHash) {
    const explorer = await getStoredExplorerUrl(notification.explorerChainId);
    if (explorer) {
      await chrome.storage.local.set({
        [`notification-${notification.notificationId}`]:
          `${explorer}/tx/${notification.explorerTxHash}`,
      });
    }
  }
  await showNotification(
    notification.notificationId,
    notification.title,
    notification.message,
  );
}
