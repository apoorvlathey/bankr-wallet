import { peekNextNonce } from "../forceInclusion/nonceManager";
import { getPendingTxRequestById } from "../requests/pendingTxStorage";
import { resolvePinnedAccount } from "./runtime";

export type TransactionNonceResult =
  | { success: true; nonce: number }
  | { success: false; error: string };

/**
 * Returns the next pending nonce for the exact account pinned to a transaction
 * review. This is a read-only preview: opening the confirmation UI does not
 * reserve or advance the in-memory rapid-send cache.
 */
export async function getTransactionNonceForReview(
  txId: string,
): Promise<TransactionNonceResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) {
    return { success: false, error: "Transaction request not found" };
  }
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) return { success: false, error: pinned.error };
  if (
    pinned.account.type !== "privateKey" &&
    pinned.account.type !== "seedPhrase" &&
    pinned.account.type !== "ledger"
  ) {
    return {
      success: false,
      error: "This account does not support custom transaction nonces",
    };
  }
  if (
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  if (pending.replacement) {
    return { success: true, nonce: pending.replacement.nonce };
  }

  try {
    return {
      success: true,
      nonce: await peekNextNonce(pinned.account.address, pending.tx.chainId),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch nonce",
    };
  }
}
