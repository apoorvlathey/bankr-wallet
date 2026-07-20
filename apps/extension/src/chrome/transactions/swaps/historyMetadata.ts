import type { SwapTxEntry } from "./types";

/** Prefer specialized metadata, then the final intent after setup/approval calls. */
export function selectSwapHistoryEntry(
  transactions: SwapTxEntry[],
): SwapTxEntry | undefined {
  return transactions.find((transaction) => transaction.bridge) ??
    transactions.find((transaction) => transaction.swapMeta) ??
    transactions[transactions.length - 1];
}
