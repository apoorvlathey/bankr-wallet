import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
import { shouldRetainUnobservedBroadcast } from "./broadcastPolicy";
import { applyReceiptToHistory } from "./receiptHistory";
import { showReceiptNotification } from "./receiptNotification";
import { fetchReceipt, fetchTxByHash } from "./receiptRpc";
import { maybeAdvanceSplitBundle } from "./receiptSideEffects";

const DROPPED_NOT_FOUND_THRESHOLD = 3;
const DROPPED_MIN_AGE_MS = 60_000;
const notFoundCounts = new Map<string, number>();

export function clearReceiptObservationState(txId: string): void {
  notFoundCounts.delete(txId);
}

export async function checkAndFinalizeReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<boolean | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;
  try {
    const receipt = await fetchReceipt(rpcUrl, txHash);
    if (receipt) {
      notFoundCounts.delete(txId);
      return applyReceiptToHistory(txId, txHash, chainId, receipt, { rpcUrl });
    }
    const transaction = await fetchTxByHash(rpcUrl, txHash);
    if (transaction === null) {
      return evaluateMissingTransaction(txId, txHash, chainId);
    }
    notFoundCounts.delete(txId);
    const tx = await getTxById(txId);
    if (tx?.broadcastUncertain) {
      await updateTxInHistory(txId, { broadcastUncertain: false });
    }
  } catch {
    // RPC failures are indistinguishable from a receipt not being available yet.
  }
  return null;
}

async function evaluateMissingTransaction(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<boolean | null> {
  const tx = await getTxById(txId);
  if (shouldRetainUnobservedBroadcast(tx, txHash)) {
    notFoundCounts.delete(txId);
    return null;
  }
  const age = tx ? Date.now() - tx.createdAt : 0;
  if (age <= DROPPED_MIN_AGE_MS) return null;
  const count = (notFoundCounts.get(txId) ?? 0) + 1;
  notFoundCounts.set(txId, count);
  if (count < DROPPED_NOT_FOUND_THRESHOLD) return null;
  notFoundCounts.delete(txId);
  await updateTxInHistory(txId, {
    status: "failed",
    error: "Transaction dropped from the mempool",
    completedAt: Date.now(),
  });
  try {
    const { recordPrivacyShieldDropped } = await import(
      "../privacy/operations/lifecycle"
    );
    await recordPrivacyShieldDropped(txId, txHash);
  } catch (error) {
    console.warn("[privacy-shield] dropped transaction mirror failed", error);
  }
  try {
    const { recordPrivacyRagequitDropped } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await recordPrivacyRagequitDropped(txId, txHash);
  } catch (error) {
    console.warn("[privacy-ragequit] dropped transaction mirror failed", error);
  }
  await showReceiptNotification(txId, txHash, chainId, false, "dropped");
  await maybeAdvanceSplitBundle(txId, txHash, "dropped");
  return false;
}
