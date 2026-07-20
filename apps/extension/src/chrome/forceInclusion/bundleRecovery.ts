import { getBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import type { CompletedTransaction } from "../txHistoryStorage";

export async function recoverStuckForceInclusionBundles(
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
