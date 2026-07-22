import { getTxById, updateTxInHistory } from "../txHistoryStorage";

export async function markOriginalReplacementDropped(
  txId: string,
): Promise<void> {
  let replacementTx = await getTxById(txId);
  while (replacementTx?.replacement) {
    const replacement = replacementTx.replacement;
    const original = await getTxById(replacement.originalTxId);
    if (!original || original.txHash !== replacement.originalTxHash) return;
    if (original.status === "pending" || original.status === "processing") {
      await updateTxInHistory(original.id, {
        status: "dropped",
        error: "Transaction replaced by a mined transaction",
        completedAt: Date.now(),
      });
    } else if (original.status !== "dropped") {
      return;
    }
    replacementTx = original;
  }
}
