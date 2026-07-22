import { decodeEventLog, parseAbi, type Hex } from "viem";

import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import { startReceiptPolling } from "../../forceInclusion/receiptPoller";
import {
  assertPrivacyShieldConfirmationAuthorization,
  isPrivacyShieldPendingTransaction,
  type PrivacyShieldConfirmationAuthorization,
} from "./submission";
import {
  listAllPrivacyShieldOperations,
  updatePrivacyShieldOperationTracking as updateStoredPrivacyShieldOperationTracking,
} from "./repository";
import { cleanupRejectedPrivacyShieldOperations } from "./rejectionLifecycle";
import { mirrorPrivacyShieldHistoryProjection } from "./historyProjection";
import type {
  PrivacyShieldOperationTrackingV1,
  PrivacyShieldTrackingErrorCode,
  PrivacyShieldTrackingState,
} from "./types";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import type { PrivacyDepositEventV1 } from "../events/types";
import type { PrivacyAspReviewStatus } from "../asp/types";
import { schedulePrivacyAspRefresh } from "../asp/alarmSchedule";
import {
  notifyPrivacyShieldApproval,
  shouldNotifyPrivacyShieldApproval,
} from "./notification";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const DEPOSIT_EVENT_ABI = parseAbi([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
]);

type MutableTracking = PrivacyShieldOperationTrackingV1;

async function updatePrivacyShieldOperationTracking(
  ...args: Parameters<typeof updateStoredPrivacyShieldOperationTracking>
): ReturnType<typeof updateStoredPrivacyShieldOperationTracking> {
  const result = await updateStoredPrivacyShieldOperationTracking(...args);
  if (result.status !== "missing") {
    await mirrorPrivacyShieldHistoryProjection(result.operation).catch((error) =>
      console.warn("[privacy-shield] activity projection failed", error)
    );
  }
  return result;
}

function normalizedHash(value: unknown): Hex | null {
  return typeof value === "string" && TX_HASH.test(value)
    ? value.toLowerCase() as Hex
    : null;
}

function serializedUint(value: unknown): string | null {
  try {
    const parsed = BigInt(value as bigint | string | number);
    const serialized = parsed.toString();
    return parsed >= 0n && UINT.test(serialized) ? serialized : null;
  } catch {
    return null;
  }
}

function advance(
  current: Readonly<PrivacyShieldOperationTrackingV1>,
  state: PrivacyShieldTrackingState,
  patch: Partial<Omit<MutableTracking, "version" | "revision" | "state" | "updatedAt">> = {},
): MutableTracking {
  return {
    ...current,
    ...patch,
    version: 1,
    revision: current.revision + 1,
    state,
    updatedAt: Math.max(Date.now(), current.updatedAt),
  };
}

/** Persist an ambiguity marker immediately before signed bytes cross a network boundary. */
export async function beginPrivacyShieldSubmission(
  pending: PendingTxRequest,
  authorization: PrivacyShieldConfirmationAuthorization | null,
): Promise<void> {
  if (!isPrivacyShieldPendingTransaction(pending)) return;
  if (!authorization || authorization.operationId !== pending.id) {
    throw new Error("Shield authorization is unavailable");
  }
  assertPrivacyShieldConfirmationAuthorization(authorization);
  const result = await updatePrivacyShieldOperationTracking(
    pending.id,
    (current) => {
      if (current.state === "submission_unknown") return null;
      if (current.state !== "awaiting_wallet_confirmation") {
        throw new Error("Shield operation is no longer confirmable");
      }
      return advance(current, "submission_unknown", {
        errorCode: "submission-unknown",
      });
    },
  );
  if (result.status === "missing") {
    throw new Error("Shield operation is unavailable");
  }
  assertPrivacyShieldConfirmationAuthorization(authorization);
}

export async function recordPrivacyShieldSubmitted(
  pending: PendingTxRequest,
  txHash: unknown,
): Promise<void> {
  if (!isPrivacyShieldPendingTransaction(pending)) return;
  const normalized = normalizedHash(txHash);
  if (!normalized) throw new Error("Shield transaction hash is invalid");
  const result = await updatePrivacyShieldOperationTracking(
    pending.id,
    (current) => {
      if (current.txHash && current.txHash.toLowerCase() !== normalized) {
        throw new Error("Shield transaction hash changed");
      }
      if (
        current.state !== "submission_unknown" &&
        current.state !== "submitted"
      ) {
        throw new Error("Shield operation cannot accept a transaction hash");
      }
      if (current.state === "submitted" && current.txHash === normalized) return null;
      return advance(current, "submitted", {
        txHash: normalized,
        errorCode: null,
      });
    },
  );
  if (result.status === "missing") throw new Error("Shield operation is unavailable");
}

export async function recordPrivacyShieldWalletRejected(
  pending: PendingTxRequest,
): Promise<void> {
  if (!isPrivacyShieldPendingTransaction(pending)) return;
  await updatePrivacyShieldOperationTracking(pending.id, (current) => {
    if (current.state !== "awaiting_wallet_confirmation") return null;
    return advance(current, "wallet_rejected", {
      errorCode: "wallet-rejected",
    });
  });
}

/** A pre-effect failure is terminal; an existing ambiguity marker is retained. */
export async function recordPrivacyShieldSubmissionFailure(
  pending: PendingTxRequest,
): Promise<void> {
  if (!isPrivacyShieldPendingTransaction(pending)) return;
  await updatePrivacyShieldOperationTracking(pending.id, (current) => {
    if (current.state === "submission_unknown" || current.state === "submitted") {
      return null;
    }
    if (current.state !== "awaiting_wallet_confirmation") return null;
    return advance(current, "submission_failed", {
      errorCode: "submission-failed",
    });
  });
}

export async function recordPrivacyShieldDropped(
  operationId: string,
  txHash: unknown,
): Promise<void> {
  const normalized = normalizedHash(txHash);
  if (!normalized) return;
  await updatePrivacyShieldOperationTracking(operationId, (current) => {
    if (
      current.txHash &&
      current.txHash.toLowerCase() !== normalized.toLowerCase()
    ) {
      throw new Error("Shield dropped transaction hash changed");
    }
    if (current.state !== "submitted" && current.state !== "submission_unknown") {
      return null;
    }
    return advance(current, "submission_failed", {
      txHash: normalized,
      errorCode: "submission-failed",
    });
  });
}

function depositEvent(receipt: any): {
  depositor: string;
  commitment: string;
  label: string;
  valueWei: string;
} | null {
  if (!Array.isArray(receipt?.logs)) return null;
  for (const log of receipt.logs) {
    try {
      if (
        typeof log?.address !== "string" ||
        log.address.toLowerCase() !==
          PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase()
      ) {
        continue;
      }
      const decoded = decodeEventLog({
        abi: DEPOSIT_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (decoded.eventName !== "Deposited") continue;
      const args = decoded.args as {
        _depositor: string;
        _commitment: bigint;
        _label: bigint;
        _value: bigint;
      };
      return {
        depositor: args._depositor,
        commitment: args._commitment.toString(),
        label: args._label.toString(),
        valueWei: args._value.toString(),
      };
    } catch {
      // Ignore unrelated logs.
    }
  }
  return null;
}

/** Apply the canonical receipt and exact Deposited event to the privacy lifecycle. */
export async function applyPrivacyShieldReceipt(args: {
  txId: string;
  txHash: string;
  chainId: number;
  receipt: any;
  succeeded: boolean;
}): Promise<void> {
  const normalized = normalizedHash(args.txHash);
  if (!normalized || args.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId) return;
  const result = await updatePrivacyShieldOperationTracking(args.txId, (current, operation) => {
    if (
      current.txHash &&
      current.txHash.toLowerCase() !== normalized.toLowerCase()
    ) {
      throw new Error("Shield receipt transaction hash changed");
    }
    if (!args.succeeded) {
      return advance(current, "public_reverted", {
        txHash: normalized,
        errorCode: "public-reverted",
      });
    }
    const blockNumber = serializedUint(args.receipt?.blockNumber);
    const deposited = depositEvent(args.receipt);
    if (!blockNumber || !deposited) {
      return advance(current, "awaiting_event", {
        txHash: normalized,
        blockNumber,
        errorCode: "event-unavailable",
      });
    }
    if (
      deposited.depositor.toLowerCase() !==
        operation.summary.accountAddress.toLowerCase() ||
      deposited.valueWei !== operation.summary.shieldedAmountWei ||
      BigInt(deposited.commitment) <= 0n ||
      BigInt(deposited.label) <= 0n
    ) {
      return advance(current, "failed_recoverable", {
        txHash: normalized,
        blockNumber,
        errorCode: "event-mismatch",
      });
    }
    return advance(current, "awaiting_asp", {
      txHash: normalized,
      blockNumber,
      commitment: deposited.commitment,
      label: deposited.label,
      poolValueWei: deposited.valueWei,
      errorCode: null,
    });
  });
  if (
    result.status === "updated" &&
    result.operation.tracking?.state === "awaiting_asp"
  ) {
    schedulePrivacyAspRefresh();
  }
}

/** Apply a globally indexed event after its encrypted precommitment matched. */
export async function applyPrivacyShieldDepositEvent(
  operationId: string,
  event: PrivacyDepositEventV1,
): Promise<void> {
  const result = await updatePrivacyShieldOperationTracking(operationId, (current, operation) => {
    if (
      event.chainId !== operation.summary.chainId ||
      event.depositor.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
      event.valueWei !== operation.summary.shieldedAmountWei ||
      (current.txHash !== null &&
        current.txHash.toLowerCase() !== event.transactionHash.toLowerCase())
    ) {
      return advance(current, "failed_recoverable", {
        errorCode: "event-mismatch",
      });
    }
    if (
      current.state === "private_ready" ||
      (current.state === "awaiting_asp" &&
        current.commitment === event.commitment &&
        current.label === event.label)
    ) {
      return null;
    }
    return advance(current, "awaiting_asp", {
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      commitment: event.commitment,
      label: event.label,
      poolValueWei: event.valueWei,
      errorCode: null,
    });
  });
  if (
    result.status === "updated" &&
    result.operation.tracking?.state === "awaiting_asp"
  ) {
    schedulePrivacyAspRefresh();
  }
}

/** Apply an ASP decision only after the caller has verified its operation binding. */
export async function applyPrivacyShieldAspReview(
  operationId: string,
  status: PrivacyAspReviewStatus,
  membershipVerified: boolean,
): Promise<void> {
  await updatePrivacyShieldOperationTracking(operationId, (current) => {
    if (
      current.state !== "awaiting_asp" &&
      current.state !== "asp_unavailable" &&
      current.state !== "asp_poi_required" &&
      current.state !== "asp_approved" &&
      current.state !== "private_ready" &&
      current.state !== "asp_declined" &&
      current.state !== "asp_removed"
    ) {
      return null;
    }
    if (status === "pending") {
      if (
        current.state === "asp_approved" ||
        current.state === "private_ready" ||
        current.state === "awaiting_asp"
      ) {
        return null;
      }
      return advance(current, "awaiting_asp", { errorCode: null });
    }
    if (status === "poi_required") {
      if (current.state === "private_ready" || current.state === "asp_poi_required") {
        return null;
      }
      return advance(current, "asp_poi_required", {
        errorCode: "asp-poi-required",
      });
    }
    if (status === "approved") {
      if (!membershipVerified) {
        throw new Error("ASP membership was not verified");
      }
      if (current.state === "private_ready" && current.errorCode === null) {
        return null;
      }
      return advance(current, "private_ready", { errorCode: null });
    }
    if (status === "declined") {
      if (current.state === "asp_declined") return null;
      return advance(current, "asp_declined", { errorCode: "asp-declined" });
    }
    if (current.state === "asp_removed") return null;
    return advance(current, "asp_removed", { errorCode: "asp-removed" });
  });
}

/** Record a fully public, onchain-root-verified Privacy Pools approval. */
export async function applyPrivacyShieldAspApproval(
  operationId: string,
): Promise<void> {
  const result = await updatePrivacyShieldOperationTracking(operationId, (current) => {
    if (
      current.state !== "awaiting_asp" &&
      current.state !== "asp_unavailable" &&
      current.state !== "asp_poi_required" &&
      current.state !== "asp_approved" &&
      current.state !== "private_ready"
    ) return null;
    if (current.state === "asp_approved" || current.state === "private_ready") {
      return null;
    }
    return advance(current, "asp_approved", { errorCode: null });
  });
  if (shouldNotifyPrivacyShieldApproval(result)) {
    await notifyPrivacyShieldApproval(operationId).catch((error) =>
      console.warn("[privacy-shield] approval notification failed", error)
    );
  }
}

/** Keep transport/root failures distinct from an ASP compliance decision. */
export async function applyPrivacyShieldAspUnavailable(
  operationId: string,
): Promise<void> {
  await updatePrivacyShieldOperationTracking(operationId, (current) => {
    if (
      current.state !== "awaiting_asp" &&
      current.state !== "asp_unavailable" &&
      current.state !== "asp_poi_required"
    ) return null;
    if (
      current.state === "asp_unavailable" &&
      current.errorCode === "asp-unavailable"
    ) return null;
    return advance(current, "asp_unavailable", {
      errorCode: "asp-unavailable",
    });
  });
}

/** Close the source deposit lifecycle after its exact public exit is verified. */
export async function recordPrivacyShieldRagequitRecovered(
  operationId: string,
): Promise<void> {
  await updatePrivacyShieldOperationTracking(operationId, (current) => {
    if (current.state === "ragequit_recovered") return null;
    if (
      current.commitment === null ||
      current.label === null ||
      current.poolValueWei === null
    ) throw new Error("Shield public recovery lineage is incomplete");
    return advance(current, "ragequit_recovered", { errorCode: null });
  });
}

export async function resumePrivacyShieldTracking(): Promise<void> {
  const operations = await cleanupRejectedPrivacyShieldOperations(
    await listAllPrivacyShieldOperations(),
  );
  for (const operation of operations) {
    await mirrorPrivacyShieldHistoryProjection(operation).catch((error) =>
      console.warn("[privacy-shield] activity projection restore failed", error)
    );
    const tracking = operation.tracking;
    if (
      tracking?.txHash &&
      (tracking.state === "submitted" ||
        tracking.state === "submission_unknown" ||
        tracking.state === "public_confirmed" ||
        tracking.state === "awaiting_event")
    ) {
      startReceiptPolling(
        operation.summary.id,
        tracking.txHash,
        operation.summary.chainId,
      );
    }
  }
  if (operations.some((operation) => {
    const state = operation.tracking?.state ?? operation.summary.state;
    return state === "awaiting_asp" ||
      state === "asp_unavailable" ||
      state === "asp_poi_required";
  })) {
    schedulePrivacyAspRefresh();
  }
}

export function privacyTrackingErrorForState(
  state: PrivacyShieldTrackingState,
): PrivacyShieldTrackingErrorCode | null {
  if (state === "wallet_rejected") return "wallet-rejected";
  if (state === "submission_failed") return "submission-failed";
  if (state === "submission_unknown") return "submission-unknown";
  if (state === "public_reverted") return "public-reverted";
  if (state === "asp_unavailable") return "asp-unavailable";
  if (state === "asp_poi_required") return "asp-poi-required";
  if (state === "asp_declined") return "asp-declined";
  if (state === "asp_removed") return "asp-removed";
  return null;
}
