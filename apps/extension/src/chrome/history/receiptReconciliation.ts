import { FLASHBLOCKS_CHAIN_IDS } from "../../constants/networks";
import { isWalletOuterGasPayer } from "./nativeDelta";
import { getTxById } from "./repository";
import { reconcileReceiptDerivedHistory } from "./receiptReconciliationWorker";
import type { CompletedTransaction } from "./types";

export function shouldReconcileReceiptDerivedHistory(
  tx: Pick<
    CompletedTransaction,
    | "status"
    | "txHash"
    | "tx"
    | "assetChanges"
    | "chainId"
    | "erc20FeePayment"
  >,
): boolean {
  const repairableStatus = tx.status === "success" ||
    (tx.status === "failed" && !!tx.erc20FeePayment);
  if (!repairableStatus || !tx.txHash || !tx.tx.from) return false;
  return (
    (!!tx.erc20FeePayment && !tx.erc20FeePayment.amountWei) ||
    tx.assetChanges?.version !== 2 || FLASHBLOCKS_CHAIN_IDS.has(tx.chainId)
  );
}

export async function queueReceiptDerivedHistoryReconciliation(
  txId: string,
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const tx = await getTxById(txId);
  if (!tx) return { success: false, error: "Transaction not found" };
  const repairableStatus = tx.status === "success" ||
    (tx.status === "failed" && !!tx.erc20FeePayment);
  if (!repairableStatus || !tx.txHash || !tx.tx.from) {
    return { success: false, error: "Transaction is not backfillable" };
  }
  if (!shouldReconcileReceiptDerivedHistory(tx)) {
    return { success: true, queued: false };
  }

  void reconcileReceiptDerivedHistory(
    txId,
    tx.txHash,
    tx.chainId,
    tx.tx.from,
    isWalletOuterGasPayer(tx.feePaymentToken, tx.erc20FeePayment),
    tx.erc20FeePayment,
    tx.userOperationHash,
  );
  return { success: true, queued: true };
}
