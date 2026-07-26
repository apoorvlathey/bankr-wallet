import { getAddress, keccak256, stringToHex } from "viem";

import { getCrossDappBatch } from "../crossDappBatch/storage";
import { getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import { getPendingTxRequestById } from "../requests/pendingTxStorage";
import { getSafeProposal } from "../safe/proposalRepository";
import type { ApprovalSimulationCall } from "../simulation/approvalIntents";
import type { ResidualApprovalRequestRef } from "../simulation/residualApprovalRequestTypes";

export interface ResolvedResidualApprovalRequest {
  ref: ResidualApprovalRequestRef;
  calls: ApprovalSimulationCall[];
  ownerAddress: string;
  chainId: number;
  fingerprint: string;
}

const FAMILIES = new Set<ResidualApprovalRequestRef["family"]>([
  "transaction",
  "batchTransaction",
  "crossDappBatch",
  "safeProposal",
]);

export function parseResidualApprovalRequestRef(
  value: unknown,
): ResidualApprovalRequestRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid approval detection request");
  }
  const raw = value as Record<string, unknown>;
  if (
    !FAMILIES.has(raw.family as ResidualApprovalRequestRef["family"]) ||
    typeof raw.requestId !== "string" ||
    raw.requestId.length < 1 ||
    raw.requestId.length > 256
  ) {
    throw new Error("Invalid approval detection request");
  }
  return {
    family: raw.family as ResidualApprovalRequestRef["family"],
    requestId: raw.requestId,
  };
}

function canonicalCall(call: ApprovalSimulationCall) {
  return {
    to: getAddress(call.to ?? "").toLowerCase(),
    value: BigInt(call.value ?? "0x0").toString(),
    data: (call.data ?? "0x").toLowerCase(),
  };
}

function resolved(
  ref: ResidualApprovalRequestRef,
  ownerAddress: string,
  chainId: number,
  calls: ApprovalSimulationCall[],
): ResolvedResidualApprovalRequest {
  const owner = getAddress(ownerAddress).toLowerCase();
  const canonicalCalls = calls.map(canonicalCall);
  return {
    ref,
    ownerAddress: owner,
    chainId,
    calls: canonicalCalls,
    fingerprint: keccak256(stringToHex(JSON.stringify({
      family: ref.family,
      requestId: ref.requestId,
      owner,
      chainId,
      calls: canonicalCalls,
    }))),
  };
}

export async function resolveResidualApprovalRequest(
  refValue: unknown,
): Promise<ResolvedResidualApprovalRequest> {
  const ref = parseResidualApprovalRequestRef(refValue);
  if (ref.family === "transaction") {
    const request = await getPendingTxRequestById(ref.requestId);
    if (!request) throw new Error("Transaction request is no longer pending");
    return resolved(ref, request.accountAddress ?? request.tx.from, request.tx.chainId, [{
      to: request.tx.to ?? undefined,
      value: request.tx.value,
      data: request.tx.data,
    }]);
  }
  if (ref.family === "batchTransaction") {
    const request = await getPendingBatchTxRequestById(ref.requestId);
    if (!request) throw new Error("Batch request is no longer pending");
    return resolved(
      ref,
      request.accountAddress ?? request.params.from ?? "",
      request.chainId,
      request.params.calls ?? [],
    );
  }
  if (ref.family === "crossDappBatch") {
    if (ref.requestId !== "active") {
      throw new Error("Invalid active batch request");
    }
    const batch = await getCrossDappBatch();
    if (!batch) throw new Error("Cross-dapp batch is no longer pending");
    return resolved(
      ref,
      batch.fromAddress,
      batch.chainId,
      batch.entries.map((entry) => ({
        to: entry.tx.to ?? undefined,
        value: entry.tx.value,
        data: entry.tx.data,
      })),
    );
  }
  const proposal = await getSafeProposal(ref.requestId);
  if (!proposal) throw new Error("Safe request is no longer pending");
  return resolved(ref, proposal.safeAddress, proposal.chainId, proposal.calls);
}
