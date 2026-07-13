import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
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
    const gasData = await buildReceiptGasData(
      options.rpcUrl,
      txHash,
      receipt,
      chainId,
      options.signedGasLimit,
    );
    await updateTxInHistory(txId, {
      status: "success",
      txHash,
      broadcastUncertain: false,
      completedAt: Date.now(),
      gasData,
    });
    startAssetChangeExtraction(txId, chainId, receipt, options.rpcUrl);
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
  chainId: number,
  receipt: any,
  rpcUrlOverride?: string,
): void {
  void (async () => {
    try {
      const rpcUrl = rpcUrlOverride ?? (await getRpcUrl(chainId));
      if (!rpcUrl) return;
      const tx = await getTxById(txId);
      const sender = tx?.tx?.from;
      if (!sender) return;
      const { extractAndStoreAssetChanges } = await import(
        "../assetChangesExtractor"
      );
      await extractAndStoreAssetChanges({
        txId,
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
