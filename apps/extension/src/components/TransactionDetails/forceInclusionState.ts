import type { ForceInclusionMeta } from "@/chrome/txHistoryStorage";

/** Derive the two receipt stages without relying on error-string parsing. */
export function getForceInclusionState(
  meta: ForceInclusionMeta,
  status: string,
  txHash: string | undefined,
) {
  const hasDistinctL2Hash = !!(txHash && txHash !== meta.l1TxHash);
  const l1Confirmed =
    status === "pending" ||
    status === "success" ||
    (status === "failed" && hasDistinctL2Hash);
  const l1Reverted = status === "failed" && !hasDistinctL2Hash;
  const l2Confirmed = meta.l2Confirmed || status === "success";
  const l2Reverted = status === "failed" && hasDistinctL2Hash;
  return {
    hasDistinctL2Hash,
    l1Confirmed,
    l1Reverted,
    l2Confirmed,
    l2Reverted,
  };
}
