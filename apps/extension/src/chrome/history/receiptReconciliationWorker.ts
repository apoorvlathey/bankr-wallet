import { getRpcUrl } from "../transactions/rpcConfig";
import { extractAssetChangesFromConfirmedReceipt } from "./assetChangeExtraction";
import { seedRecentlyReceivedSafely } from "./assetChangePersistence";
import { settleErc20FeeRecordFromReceipt } from "./erc20FeeSettlement";
import { buildHistoryGasData } from "./receiptGasData";
import { updateTxInHistory } from "./repository";
import { fetchReceiptAtRpcUrl, fetchTxAtRpcUrl } from "./rpc";
import { fetchSettledReceiptAtRpcUrl } from "./receiptSettlement";
import type { CompletedTransaction } from "./types";

export async function reconcileReceiptDerivedHistory(
  txId: string,
  txHash: string,
  chainId: number,
  sender: string,
  payerForGas: boolean,
  feePayment: CompletedTransaction["erc20FeePayment"],
  userOperationHash: string | undefined,
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
        payerForGas,
      }),
      fetchTxAtRpcUrl(rpcUrl, txHash),
    ]);
    const settled = settleErc20FeeRecordFromReceipt(
      record,
      feePayment,
      userOperationHash,
      sender,
      receipt,
    );
    if (settled.record) await seedRecentlyReceivedSafely(chainId, settled.record);
    const gasLimit = transaction?.gas
      ? BigInt(transaction.gas).toString()
      : undefined;
    await updateTxInHistory(txId, {
      assetChanges: settled.record ?? undefined,
      ...(settled.payment ? { erc20FeePayment: settled.payment } : {}),
      gasData: buildHistoryGasData(receipt, chainId, gasLimit),
    });
  } catch (error) {
    console.warn("[receipt-reconciliation] failed", error);
  }
}
