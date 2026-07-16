import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
import { fetchSettledReceiptAtRpcUrl } from "../history/receiptSettlement";
import { showReceiptNotification } from "./receiptNotification";
import { buildReceiptGasData } from "./receiptRpc";
import {
  applyPostNotificationReceiptEffects,
  applyReceiptStateMirrors,
} from "./receiptSideEffects";

export async function applyReceiptToHistory(
  txId: string,
  txHash: string,
  chainId: number,
  receipt: any,
  options: { rpcUrl?: string; signedGasLimit?: bigint | string } = {},
): Promise<boolean> {
  const succeeded =
    receipt.status === "success" ||
    receipt.status === "0x1" ||
    receipt.status === 1 ||
    receipt.status === 1n;
  if (succeeded) {
    const rpcUrl = options.rpcUrl ?? (await getRpcUrl(chainId)) ?? undefined;
    const settledReceipt = rpcUrl
      ? await fetchSettledReceiptAtRpcUrl(
          rpcUrl,
          txHash,
          chainId,
          receipt,
        )
      : receipt;
    const gasData = settledReceipt
      ? await buildReceiptGasData(
          rpcUrl,
          txHash,
          settledReceipt,
          chainId,
          options.signedGasLimit,
        )
      : undefined;
    await updateTxInHistory(txId, {
      status: "success",
      txHash,
      broadcastUncertain: false,
      completedAt: Date.now(),
      gasData,
    });
    startAssetChangeExtraction(txId, txHash, chainId, settledReceipt, rpcUrl);
  } else {
    await updateTxInHistory(txId, {
      status: "failed",
      txHash,
      broadcastUncertain: false,
      error: "Transaction reverted onchain",
      completedAt: Date.now(),
    });
  }

  await applyReceiptStateMirrors({
    txId,
    txHash,
    chainId,
    receipt,
    succeeded,
    rpcUrl: options.rpcUrl,
  });
  await showReceiptNotification(txId, txHash, chainId, succeeded);
  await applyPostNotificationReceiptEffects({
    txId,
    txHash,
    chainId,
    receipt,
    succeeded,
  });
  return succeeded;
}

function startAssetChangeExtraction(
  txId: string,
  txHash: string,
  chainId: number,
  receipt?: any,
  rpcUrlOverride?: string,
): void {
  void (async () => {
    try {
      const rpcUrl = rpcUrlOverride ?? (await getRpcUrl(chainId));
      if (!rpcUrl) return;
      const tx = await getTxById(txId);
      const sender = tx?.tx?.from;
      if (!sender) return;
      const { extractAssetChangesWhenReceiptAvailable } = await import(
        "../receiptEnrichment"
      );
      extractAssetChangesWhenReceiptAvailable({
        txId,
        txHash,
        chainId,
        userAddress: sender,
        receipt,
        rpcUrl,
      });
    } catch (error) {
      console.warn("[receipt] asset-changes extraction failed", error);
    }
  })();
}
