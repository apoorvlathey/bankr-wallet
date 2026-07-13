import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { getStoredChainName, getStoredExplorerUrl } from "@/lib/chains";
import { showNotification } from "../transactions/notification";

export async function showReceiptNotification(
  txId: string,
  txHash: string,
  chainId: number,
  succeeded: boolean,
  failureReason: "reverted" | "dropped" = "reverted",
): Promise<void> {
  const config = CHAIN_CONFIG[chainId];
  const chainName = config?.name || (await getStoredChainName(chainId));
  const notificationId = succeeded
    ? `tx-success-${txId}`
    : `tx-failed-${txId}`;
  if (succeeded) {
    const explorer = config?.explorer || (await getStoredExplorerUrl(chainId));
    if (explorer) {
      await chrome.storage.local.set({
        [`notification-${notificationId}`]: `${explorer}/tx/${txHash}`,
      });
    }
  }
  const failureMessage =
    failureReason === "dropped"
      ? `Transaction on ${chainName} was dropped from the mempool.`
      : `Transaction on ${chainName} reverted onchain.`;
  await showNotification(
    notificationId,
    succeeded ? "Transaction Confirmed" : "Transaction Failed",
    succeeded
      ? `Transaction on ${chainName} confirmed onchain. Click to view.`
      : failureMessage,
  );
}
