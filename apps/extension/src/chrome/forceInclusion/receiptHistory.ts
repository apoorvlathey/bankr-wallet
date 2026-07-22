import { getRpcUrl } from "../transactions/rpcConfig";
import { updateTxInHistory } from "../txHistoryStorage";
import { fetchSettledReceiptAtRpcUrl } from "../history/receiptSettlement";
import { startReceiptAssetChangeExtraction } from "./receiptAssetEnrichment";
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
  options: {
    rpcUrl?: string;
    signedGasLimit?: bigint | string;
    feePaymentPaymaster?: string;
  } = {},
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
    const extraction = startReceiptAssetChangeExtraction(
      txId,
      txHash,
      chainId,
      settledReceipt,
      rpcUrl,
      options.feePaymentPaymaster,
    );
    void extraction;
  } else {
    await updateTxInHistory(txId, {
      status: "failed",
      txHash,
      broadcastUncertain: false,
      error: "Transaction reverted onchain",
      completedAt: Date.now(),
    });
    if (options.feePaymentPaymaster) {
      void startReceiptAssetChangeExtraction(
        txId,
        txHash,
        chainId,
        receipt,
        options.rpcUrl,
        options.feePaymentPaymaster,
      );
    }
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
