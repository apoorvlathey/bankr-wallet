import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";

export type CombinedRequest =
  | { type: "tx"; request: PendingTxRequest }
  | { type: "sig"; request: PendingSignatureRequest }
  | { type: "permission"; request: PendingErc7715PermissionRequest }
  | { type: "batch"; request: PendingBatchTxRequest }
  | { type: "crossDappBatch"; request: CrossDappBatch };

/**
 * Produces the stable request-carousel order. A user-assembled cross-dapp
 * batch keeps its dedicated first slot; all provider requests follow oldest
 * first regardless of request family.
 */
export function getCombinedRequests(
  txRequests: PendingTxRequest[],
  sigRequests: PendingSignatureRequest[],
  batchRequests: PendingBatchTxRequest[] = [],
  crossDappBatch?: CrossDappBatch | null,
  permissionRequests: PendingErc7715PermissionRequest[] = [],
): CombinedRequest[] {
  const rest: Array<Exclude<CombinedRequest, { type: "crossDappBatch" }>> = [
    ...txRequests.map((request) => ({ type: "tx" as const, request })),
    ...sigRequests.map((request) => ({ type: "sig" as const, request })),
    ...permissionRequests.map((request) => ({
      type: "permission" as const,
      request,
    })),
    ...batchRequests.map((request) => ({ type: "batch" as const, request })),
  ];

  rest.sort((a, b) => a.request.timestamp - b.request.timestamp);

  if (crossDappBatch && crossDappBatch.entries.length > 0) {
    return [{ type: "crossDappBatch", request: crossDappBatch }, ...rest];
  }
  return rest;
}
