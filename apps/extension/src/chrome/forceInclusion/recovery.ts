import type { Hash } from "viem";
import {
  getTxHistory,
  updateTxInHistory,
  type CompletedTransaction,
} from "../txHistoryStorage";
import { createL1PublicClient, getL1RpcUrl } from "./l1Client";
import {
  buildForceInclusionL1GasData,
  isForceInclusionL1GasData,
} from "./l1GasData";
import { isForceInclusionL2Hash } from "./broadcastPolicy";
import { recoverStuckForceInclusionBundles } from "./bundleRecovery";
import { extractL2Hash } from "./singleOutcome";

export async function recoverStuckForceInclusionTxs(): Promise<void> {
  const history = await getTxHistory();
  for (const tx of history) await recoverSingleEntry(tx);
  await recoverStuckForceInclusionBundles(await getTxHistory());
}

async function recoverSingleEntry(tx: CompletedTransaction): Promise<void> {
  if (!tx.forceInclusionMeta) return;
  if (tx.status === "failed") {
    const knownL2Hash = tx.txHash;
    if (
      tx.error === "Transaction dropped from the mempool" &&
      isForceInclusionL2Hash(tx, knownL2Hash)
    ) {
      await updateTxInHistory(tx.id, {
        status: "pending",
        error: undefined,
        completedAt: undefined,
      });
      const { startReceiptPolling } = await import("./receiptPoller");
      startReceiptPolling(tx.id, knownL2Hash!, tx.forceInclusionMeta.l2ChainId);
    }
    return;
  }
  if (tx.status === "success" && isForceInclusionL1GasData(tx.gasData)) return;
  const l1Hash = tx.forceInclusionMeta.l1TxHash;
  if (!l1Hash) return;
  const hasKnownL2Hash = Boolean(
    tx.status === "pending" && tx.txHash && tx.txHash !== l1Hash,
  );

  try {
    const client = createL1PublicClient(
      await getL1RpcUrl(tx.forceInclusionMeta.l1ChainId),
    );
    const receipt = await client
      .getTransactionReceipt({ hash: l1Hash as Hash })
      .catch(() => null);
    if (!receipt) return;
    if (receipt.status === "reverted") {
      if (tx.status === "success") return;
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

    const gasData = buildForceInclusionL1GasData(
      receipt,
      tx.forceInclusionMeta.l1ChainId,
    );
    if (tx.status === "success" || hasKnownL2Hash) {
      await updateTxInHistory(tx.id, { gasData });
      return;
    }

    const l2Hash = extractL2Hash(receipt);
    if (l2Hash) {
      await updateTxInHistory(tx.id, {
        status: "pending",
        txHash: l2Hash,
        broadcastUncertain: false,
        gasData,
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
        gasData,
      });
    } else {
      await updateTxInHistory(tx.id, { gasData });
    }
  } catch (error) {
    console.warn(
      `[ForceInclusion Recovery] Failed to check tx ${tx.id}:`,
      error,
    );
  }
}
