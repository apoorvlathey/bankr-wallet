import type { Hash } from "viem";
import { BUNDLE_STATUS } from "../erc5792Types";
import { getBundleStatus } from "../batch/bundleStatusStorage";
import {
  getTxHistory,
  updateTxInHistory,
  type CompletedTransaction,
} from "../txHistoryStorage";
import { createL1PublicClient, getL1RpcUrl } from "./l1Client";
import { extractL2Hash } from "./singleOutcome";

export async function recoverStuckForceInclusionTxs(): Promise<void> {
  const history = await getTxHistory();
  for (const tx of history) await recoverSingleEntry(tx);
  await recoverStuckForceInclusionBundles(history);
}

async function recoverSingleEntry(tx: CompletedTransaction): Promise<void> {
  if (!tx.forceInclusionMeta) return;
  if (tx.status === "success" || tx.status === "failed") return;
  const l1Hash = tx.forceInclusionMeta.l1TxHash;
  if (!l1Hash) return;
  if (tx.status === "pending" && tx.txHash && tx.txHash !== l1Hash) return;

  try {
    const client = createL1PublicClient(
      await getL1RpcUrl(tx.forceInclusionMeta.l1ChainId),
    );
    const receipt = await client
      .getTransactionReceipt({ hash: l1Hash as Hash })
      .catch(() => null);
    if (!receipt) return;
    if (receipt.status === "reverted") {
      await updateTxInHistory(tx.id, {
        status: "failed",
        broadcastUncertain: false,
        error: "L1 deposit transaction reverted onchain",
        completedAt: Date.now(),
      });
      console.log(
        `[ForceInclusion Recovery] Marked ${tx.id} as failed (L1 reverted)`,
      );
      return;
    }

    const l2Hash = extractL2Hash(receipt);
    if (l2Hash) {
      await updateTxInHistory(tx.id, {
        status: "pending",
        txHash: l2Hash,
        broadcastUncertain: false,
        forceInclusionMeta: { ...tx.forceInclusionMeta, l1TxHash: l1Hash },
      });
      const { startReceiptPolling } = await import("./receiptPoller");
      startReceiptPolling(tx.id, l2Hash, tx.forceInclusionMeta.l2ChainId);
      console.log(
        `[ForceInclusion Recovery] Recovered ${tx.id} with L2 hash ${l2Hash}`,
      );
    } else if (tx.status === "processing") {
      await updateTxInHistory(tx.id, {
        status: "pending",
        txHash: l1Hash,
        broadcastUncertain: false,
      });
    }
  } catch (error) {
    console.warn(
      `[ForceInclusion Recovery] Failed to check tx ${tx.id}:`,
      error,
    );
  }
}

async function recoverStuckForceInclusionBundles(
  history: CompletedTransaction[],
): Promise<void> {
  const bundles = new Map<string, CompletedTransaction[]>();
  for (const tx of history) {
    if (!tx.forceInclusionMeta) continue;
    const colon = tx.id.indexOf(":");
    if (colon < 0) continue;
    const bundleId = tx.id.slice(0, colon);
    const existing = bundles.get(bundleId);
    if (existing) existing.push(tx);
    else bundles.set(bundleId, [tx]);
  }

  for (const [bundleId, subTxs] of bundles) {
    try {
      const status = await getBundleStatus(bundleId);
      if (!status || status.status !== BUNDLE_STATUS.PENDING) continue;
      const sorted = [...subTxs].sort(
        (a, b) =>
          parseInt(a.id.split(":")[1] || "0", 10) -
          parseInt(b.id.split(":")[1] || "0", 10),
      );
      const results = sorted.map((tx) => {
        const l1TxHash = tx.forceInclusionMeta?.l1TxHash || undefined;
        return {
          txId: tx.id,
          success: !!l1TxHash && tx.status !== "failed",
          l1TxHash,
          error: tx.error,
        };
      });
      const chainName = sorted[0]?.chainName || `Chain ${sorted[0]?.chainId}`;
      console.log(
        `[ForceInclusion Recovery] Restarting bundle tracker for ${bundleId} (${results.length} sub-txs)`,
      );
      const { trackBatchForceInclusionCompletion } = await import("./batch");
      void trackBatchForceInclusionCompletion(bundleId, chainName, results);
    } catch (error) {
      console.warn(
        `[ForceInclusion Recovery] Failed to restart bundle tracker for ${bundleId}:`,
        error,
      );
    }
  }
}
