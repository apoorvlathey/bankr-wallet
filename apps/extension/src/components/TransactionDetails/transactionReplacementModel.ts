import type { CompletedTransaction } from "@/chrome/txHistoryStorage";

/** Renderer hint only; the background repeats every eligibility check. */
export function canPrepareTransactionReplacement(
  tx: CompletedTransaction,
): boolean {
  return Boolean(
    tx.status === "pending" &&
      /^0x[0-9a-fA-F]{64}$/.test(tx.txHash ?? "") &&
      (tx.accountType === "privateKey" ||
        tx.accountType === "seedPhrase" ||
        tx.accountType === "ledger") &&
      !tx.forceInclusionMeta &&
      !tx.userOperationHash &&
      !tx.feePaymentToken &&
      !tx.erc20FeePayment &&
      !tx.replacedByTxId,
  );
}
