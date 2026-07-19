import { FLASHBLOCKS_CHAIN_IDS } from "../../constants/networks";
import { getRpcUrl } from "../transactions/rpcConfig";
import { extractAssetChangesFromConfirmedReceipt } from "./assetChangeExtraction";
import { seedRecentlyReceivedSafely } from "./assetChangePersistence";
import { buildHistoryGasData } from "./receiptGasData";
import { getTxById, updateTxInHistory } from "./repository";
import { fetchReceiptAtRpcUrl, fetchTxAtRpcUrl } from "./rpc";
import { fetchSettledReceiptAtRpcUrl } from "./receiptSettlement";
import type { CompletedTransaction } from "./types";

export function shouldReconcileReceiptDerivedHistory(
  tx: Pick<
    CompletedTransaction,
    "status" | "txHash" | "tx" | "assetChanges" | "chainId"
  >,
): boolean {
  if (tx.status !== "success" || !tx.txHash || !tx.tx.from) return false;
  return (
    tx.assetChanges?.version !== 2 || FLASHBLOCKS_CHAIN_IDS.has(tx.chainId)
  );
}

export async function queueReceiptDerivedHistoryReconciliation(
  txId: string,
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const tx = await getTxById(txId);
  if (!tx) return { success: false, error: "Transaction not found" };
  if (tx.status !== "success" || !tx.txHash || !tx.tx.from) {
    return { success: false, error: "Transaction is not backfillable" };
  }
  if (!shouldReconcileReceiptDerivedHistory(tx)) {
    return { success: true, queued: false };
  }

  void reconcile(txId, tx.txHash, tx.chainId, tx.tx.from);
  return { success: true, queued: true };
}

async function reconcile(
  txId: string,
  txHash: string,
  chainId: number,
  sender: string,
): Promise<void> {
  try {
    const rpcUrl = await getRpcUrl(chainId);
    if (!rpcUrl) return;
    const initialReceipt = await fetchReceiptAtRpcUrl(rpcUrl, txHash);
    const receipt = await fetchSettledReceiptAtRpcUrl(
      rpcUrl,
      txHash,
      chainId,
      initialReceipt,
    );
    if (!receipt) return;

    const [record, transaction] = await Promise.all([
      extractAssetChangesFromConfirmedReceipt({
        receipt,
        userAddress: sender,
        chainId,
        rpcUrl,
        payerForGas: true,
      }),
      fetchTxAtRpcUrl(rpcUrl, txHash),
    ]);
    if (record) await seedRecentlyReceivedSafely(chainId, record);
    const gasLimit = transaction?.gas
      ? BigInt(transaction.gas).toString()
      : undefined;
    await updateTxInHistory(txId, {
      assetChanges: record ?? undefined,
      gasData: buildHistoryGasData(receipt, chainId, gasLimit),
    });
  } catch (error) {
    console.warn("[receipt-reconciliation] failed", error);
  }
}
