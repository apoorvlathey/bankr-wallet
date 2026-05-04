/**
 * Transaction Receipt Poller
 * Polls eth_getTransactionReceipt for pending transactions until confirmed or timed out.
 * Uses exponential backoff to avoid rate limiting.
 */

import {
  updateTxInHistory,
  getPendingConfirmationTxs,
  getTxById,
  type GasData,
} from "./txHistoryStorage";
import { getRpcUrl, showNotification } from "./txHandlers";
import { OP_STACK_CHAIN_IDS, FLASHBLOCKS_CHAIN_IDS } from "../constants/networks";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getStoredChainName, getStoredExplorerUrl } from "@/lib/chains";

/** Polling config */
const INITIAL_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 30_000;
const BACKOFF_FACTOR = 1.5;
const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fast-poll phase for chains that support Flashblocks (~200ms preconfs on Base).
 * On a Flashblocks-aware RPC, eth_getTransactionReceipt resolves within ~200ms;
 * on a non-aware RPC it just resolves at normal block time and the wasted polls
 * are negligible. The 5s window covers both the Flashblock arrival and a normal
 * 2s block confirmation, so even a non-aware RPC will catch the receipt before
 * we drop into the standard backoff loop.
 */
const FLASHBLOCKS_FAST_INTERVAL_MS = 250;
const FLASHBLOCKS_FAST_PHASE_MS = 5_000;

/**
 * Dropped-tx detection: when the receipt is null, we also check
 * eth_getTransactionByHash. If the RPC doesn't know about the tx, it was
 * likely dropped from the mempool (replaced, evicted, or never propagated).
 * We require multiple consecutive misses and a minimum age to tolerate
 * propagation lag and load-balanced RPCs that may briefly not see the tx.
 */
const DROPPED_NOT_FOUND_THRESHOLD = 3;
const DROPPED_MIN_AGE_MS = 60_000;
const notFoundCounts = new Map<string, number>();

/** Track active pollers by txId to avoid duplicates */
const activePollers = new Set<string>();

/**
 * Start polling for a transaction receipt.
 * Resolves when the tx is confirmed, failed, or times out.
 */
export function startReceiptPolling(
  txId: string,
  txHash: string,
  chainId: number,
): void {
  if (activePollers.has(txId)) return;
  activePollers.add(txId);

  pollReceipt(txId, txHash, chainId).finally(() => {
    activePollers.delete(txId);
    notFoundCounts.delete(txId);
  });
}

async function pollReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const startTime = Date.now();

  // Flashblocks fast phase: tight polling for the first ~5s on chains that
  // support sub-second preconfirmations.
  if (FLASHBLOCKS_CHAIN_IDS.has(chainId)) {
    const fastPhaseEnd = startTime + FLASHBLOCKS_FAST_PHASE_MS;
    while (Date.now() < fastPhaseEnd) {
      await sleep(FLASHBLOCKS_FAST_INTERVAL_MS);
      const confirmed = await checkAndFinalizeReceipt(txId, txHash, chainId);
      if (confirmed !== null) return;
    }
  }

  let interval = INITIAL_INTERVAL_MS;

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    await sleep(interval);

    const confirmed = await checkAndFinalizeReceipt(txId, txHash, chainId);
    if (confirmed !== null) return; // Resolved (success or failed)

    // Exponential backoff
    interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL_MS);
  }

  // Timed out — do one final check, then stop silently if still pending.
  // The frontend will resume polling when the user opens the activity tab.
  await checkAndFinalizeReceipt(txId, txHash, chainId);
}

/**
 * Check receipt and finalize tx if found.
 * Returns true/false if resolved, null if receipt not yet available.
 */
async function checkAndFinalizeReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<boolean | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) {
    // Can't poll without RPC — leave as pending, frontend will retry when UI opens
    return null;
  }

  try {
    const receipt = await fetchReceipt(rpcUrl, txHash);

    if (receipt) {
      notFoundCounts.delete(txId);
      const succeeded = receipt.status === "0x1";

      if (succeeded) {
        const gasData = await buildGasData(rpcUrl, txHash, receipt, chainId);
        await updateTxInHistory(txId, {
          status: "success",
          completedAt: Date.now(),
          gasData,
        });
      } else {
        await updateTxInHistory(txId, {
          status: "failed",
          error: "Transaction reverted on-chain",
          completedAt: Date.now(),
        });
      }

      await showConfirmationNotification(txId, txHash, chainId, succeeded);
      return succeeded;
    }

    // Receipt not yet available — check whether the RPC still knows about the
    // tx. A null response here means the tx has been dropped from the mempool.
    const txData = await fetchTxByHash(rpcUrl, txHash);
    if (txData === null) {
      const tx = await getTxById(txId);
      const age = tx ? Date.now() - tx.createdAt : 0;
      if (age > DROPPED_MIN_AGE_MS) {
        const count = (notFoundCounts.get(txId) ?? 0) + 1;
        notFoundCounts.set(txId, count);
        if (count >= DROPPED_NOT_FOUND_THRESHOLD) {
          notFoundCounts.delete(txId);
          await updateTxInHistory(txId, {
            status: "failed",
            error: "Transaction dropped from the mempool",
            completedAt: Date.now(),
          });
          await showConfirmationNotification(
            txId,
            txHash,
            chainId,
            false,
            "dropped",
          );
          return false;
        }
      }
    } else {
      notFoundCounts.delete(txId);
    }
  } catch {
    // RPC error — treat as "not yet available"
  }

  return null;
}

async function fetchTxByHash(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionByHash",
      params: [txHash],
    }),
  });
  const json = await response.json();
  return json.result ?? null;
}

async function fetchReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  });
  const json = await response.json();
  return json.result || null;
}

async function buildGasData(
  rpcUrl: string,
  txHash: string,
  receipt: any,
  chainId: number,
): Promise<GasData> {
  // Fetch tx data for gas limit
  let txData: any = null;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [txHash],
      }),
    });
    const json = await response.json();
    txData = json.result;
  } catch {
    // Non-critical
  }

  const gasData: GasData = {
    gasUsed: BigInt(receipt.gasUsed).toString(),
    gasLimit: txData?.gas
      ? BigInt(txData.gas).toString()
      : BigInt(receipt.gasUsed).toString(),
    effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
  };

  if (OP_STACK_CHAIN_IDS.has(chainId)) {
    if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
    if (receipt.l1GasUsed)
      gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
    if (receipt.l1GasPrice)
      gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
  }

  return gasData;
}

async function showConfirmationNotification(
  txId: string,
  txHash: string,
  chainId: number,
  succeeded: boolean,
  failureReason: "reverted" | "dropped" = "reverted",
): Promise<void> {
  const chainConfig = CHAIN_CONFIG[chainId];
  const chainName = chainConfig?.name || (await getStoredChainName(chainId));

  const notificationId = succeeded
    ? `tx-success-${txId}`
    : `tx-failed-${txId}`;

  if (succeeded) {
    const explorer = chainConfig?.explorer || (await getStoredExplorerUrl(chainId));
    const explorerUrl = explorer ? `${explorer}/tx/${txHash}` : null;

    if (explorerUrl) {
      await chrome.storage.local.set({
        [`notification-${notificationId}`]: explorerUrl,
      });
    }
  }

  const failureMessage =
    failureReason === "dropped"
      ? `Transaction on ${chainName} was dropped from the mempool.`
      : `Transaction on ${chainName} reverted on-chain.`;

  await showNotification(
    notificationId,
    succeeded ? "Transaction Confirmed" : "Transaction Failed",
    succeeded
      ? `Transaction on ${chainName} confirmed on-chain. Click to view.`
      : failureMessage,
  );
}

/**
 * Check a single pending tx's receipt on demand (called from frontend polling).
 * Returns the updated status or null if still pending.
 * Skips the RPC call if a background poller is already tracking this tx.
 */
export async function checkPendingTxReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<"success" | "failed" | null> {
  // Skip if background poller is already tracking — avoids duplicate RPC calls
  if (activePollers.has(txId)) return null;

  const result = await checkAndFinalizeReceipt(txId, txHash, chainId);
  if (result === true) return "success";
  if (result === false) return "failed";
  return null;
}

/**
 * Resume polling for any transactions stuck in "pending" status.
 * Called on service worker startup.
 */
export async function resumePendingPollers(): Promise<void> {
  const pendingTxs = await getPendingConfirmationTxs();
  for (const tx of pendingTxs) {
    if (tx.txHash) {
      startReceiptPolling(tx.id, tx.txHash, tx.chainId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
