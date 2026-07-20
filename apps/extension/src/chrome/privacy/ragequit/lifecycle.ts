import { decodeEventLog, parseAbi, type Hex } from "viem";

import { startReceiptPolling } from "../../forceInclusion/receiptPoller";
import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import {
  applyPrivacyCommitmentRagequit,
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import { listPrivacyRagequitEvents } from "../events/repository";
import type { PrivacyRagequitEventV1 } from "../events/types";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import { recordPrivacyShieldRagequitRecovered } from "../operations/lifecycle";
import { decryptPrivacyRagequitDetails } from "./crypto";
import {
  listAllPrivacyRagequits,
  updatePrivacyRagequitTracking,
} from "./repository";
import {
  assertPrivacyRagequitAuthorization,
  isPrivacyRagequitPendingTransaction,
  revalidatePrivacyRagequitConfirmation,
  type PrivacyRagequitAuthorization,
} from "./submission";
import type {
  PrivacyRagequitState,
  PrivacyRagequitTrackingV1,
  StoredPrivacyRagequitV1,
} from "./types";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const RAGEQUIT_EVENT_ABI = parseAbi([
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
]);

function normalizedHash(value: unknown): Hex | null {
  return typeof value === "string" && TX_HASH.test(value)
    ? value.toLowerCase() as Hex
    : null;
}

function serializedUint(value: unknown): string | null {
  try {
    const parsed = BigInt(value as bigint | string | number);
    return parsed >= 0n ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function advance(
  current: Readonly<PrivacyRagequitTrackingV1>,
  state: PrivacyRagequitState,
  patch: Partial<Omit<PrivacyRagequitTrackingV1, "version" | "revision" | "state" | "updatedAt">> = {},
): PrivacyRagequitTrackingV1 {
  return {
    ...current,
    ...patch,
    version: 1,
    revision: current.revision + 1,
    state,
    updatedAt: Math.max(Date.now(), current.updatedAt),
  };
}

async function releaseClaim(operation: StoredPrivacyRagequitV1): Promise<void> {
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) return;
  const details = await decryptPrivacyRagequitDetails(material.key, operation);
  if (!details) return;
  const commitment = (await readPrivacyCommitments(material.key, material.keyId))
    .find((item) => item.record.id === details.commitmentId);
  if (
    commitment?.record.revision === details.commitmentRevision + 1 &&
    commitment.details.status === "ragequit_pending" &&
    commitment.details.commitment === details.commitmentHash &&
    commitment.details.balanceWei === details.balanceWei
  ) {
    await updatePrivacyCommitmentStatus(
      material.key,
      material.keyId,
      details.commitmentId,
      details.previousStatus,
    );
  }
}

export async function beginPrivacyRagequitSubmission(
  pending: PendingTxRequest,
  authorization: PrivacyRagequitAuthorization | null,
): Promise<void> {
  if (!isPrivacyRagequitPendingTransaction(pending)) return;
  if (!authorization || authorization.operationId !== pending.id) {
    throw new Error("Public recovery authorization is unavailable");
  }
  await revalidatePrivacyRagequitConfirmation(pending, authorization);
  const operation = await updatePrivacyRagequitTracking(pending.id, (current) => {
    if (current.state === "submission_unknown") return null;
    if (current.state !== "awaiting_wallet_confirmation") {
      throw new Error("Public recovery is no longer confirmable");
    }
    return advance(current, "submission_unknown", { errorCode: "submission-unknown" });
  });
  if (!operation) throw new Error("Public recovery is unavailable");
  assertPrivacyRagequitAuthorization(authorization);
}

export async function recordPrivacyRagequitSubmitted(
  pending: PendingTxRequest,
  txHash: unknown,
): Promise<void> {
  if (!isPrivacyRagequitPendingTransaction(pending)) return;
  const normalized = normalizedHash(txHash);
  if (!normalized) throw new Error("Public recovery transaction hash is invalid");
  const operation = await updatePrivacyRagequitTracking(pending.id, (current) => {
    if (current.txHash && current.txHash.toLowerCase() !== normalized) {
      throw new Error("Public recovery transaction hash changed");
    }
    if (current.state !== "submission_unknown" && current.state !== "submitted") {
      throw new Error("Public recovery cannot accept a transaction hash");
    }
    if (current.state === "submitted" && current.txHash === normalized) return null;
    return advance(current, "submitted", { txHash: normalized, errorCode: null });
  });
  if (!operation) throw new Error("Public recovery is unavailable");
}

export async function recordPrivacyRagequitWalletRejected(
  pending: PendingTxRequest,
): Promise<void> {
  if (!isPrivacyRagequitPendingTransaction(pending)) return;
  const operation = await updatePrivacyRagequitTracking(pending.id, (current) =>
    current.state === "awaiting_wallet_confirmation"
      ? advance(current, "wallet_rejected", { errorCode: "wallet-rejected" })
      : null,
  );
  if (operation?.tracking.state === "wallet_rejected") await releaseClaim(operation);
}

export async function recordPrivacyRagequitSubmissionFailure(
  pending: PendingTxRequest,
): Promise<void> {
  if (!isPrivacyRagequitPendingTransaction(pending)) return;
  const operation = await updatePrivacyRagequitTracking(pending.id, (current) => {
    if (current.state === "submission_unknown" || current.state === "submitted") return null;
    return current.state === "awaiting_wallet_confirmation"
      ? advance(current, "submission_failed", { errorCode: "submission-failed" })
      : null;
  });
  if (operation?.tracking.state === "submission_failed") await releaseClaim(operation);
}

export async function recordPrivacyRagequitDropped(
  operationId: string,
  txHash: unknown,
): Promise<void> {
  const normalized = normalizedHash(txHash);
  if (!normalized) return;
  await updatePrivacyRagequitTracking(operationId, (current) => {
    if (current.txHash && current.txHash.toLowerCase() !== normalized) {
      throw new Error("Public recovery transaction hash changed");
    }
    if (current.state !== "submitted" && current.state !== "submission_unknown") return null;
    return advance(current, "failed_recoverable", {
      txHash: normalized,
      errorCode: "submission-failed",
    });
  });
}

export function decodePrivacyRagequitReceiptEvent(receipt: any): Omit<PrivacyRagequitEventV1, "version" | "id" | "chainId" | "blockHash" | "blockNumber" | "logIndex" | "transactionHash"> | null {
  if (!Array.isArray(receipt?.logs)) return null;
  for (const log of receipt.logs) {
    try {
      if (
        typeof log?.address !== "string" ||
        log.address.toLowerCase() !==
          PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address.toLowerCase()
      ) continue;
      const decoded = decodeEventLog({
        abi: RAGEQUIT_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (decoded.eventName !== "Ragequit") continue;
      const args = decoded.args as {
        _ragequitter: `0x${string}`;
        _commitment: bigint;
        _label: bigint;
        _value: bigint;
      };
      return {
        ragequitter: args._ragequitter,
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

async function finalizeRecovery(
  operation: StoredPrivacyRagequitV1,
  event: Pick<PrivacyRagequitEventV1, "ragequitter" | "commitment" | "label" | "valueWei">,
): Promise<boolean> {
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) return false;
  const details = await decryptPrivacyRagequitDetails(material.key, operation);
  if (!details) throw new Error("Public recovery details are unavailable");
  if (
    event.ragequitter.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
    event.commitment !== details.commitmentHash ||
    event.label !== details.label ||
    event.valueWei !== details.balanceWei
  ) throw new Error("Public recovery event does not match");
  const commitment = (await readPrivacyCommitments(material.key, material.keyId))
    .find((item) => item.record.id === details.commitmentId);
  if (!commitment) throw new Error("Public recovery commitment is unavailable");
  await applyPrivacyCommitmentRagequit(material.key, material.keyId, {
    commitmentId: details.commitmentId,
    expectedRevision: details.commitmentRevision + 1,
    expectedCommitment: details.commitmentHash,
    expectedBalanceWei: details.balanceWei,
  });
  if (commitment.details.sourceOperationId) {
    await recordPrivacyShieldRagequitRecovered(
      commitment.details.sourceOperationId,
    );
  }
  return true;
}

export async function applyPrivacyRagequitReceipt(args: {
  txId: string;
  txHash: string;
  chainId: number;
  receipt: any;
  succeeded: boolean;
}): Promise<void> {
  const normalized = normalizedHash(args.txHash);
  if (!normalized || args.chainId !== PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId) return;
  const operations = await listAllPrivacyRagequits();
  const operation = operations.find((item) => item.summary.id === args.txId);
  if (!operation) return;
  if (operation.tracking.txHash && operation.tracking.txHash.toLowerCase() !== normalized) {
    throw new Error("Public recovery receipt transaction hash changed");
  }
  if (!args.succeeded) {
    const updated = await updatePrivacyRagequitTracking(args.txId, (current) =>
      advance(current, "public_reverted", {
        txHash: normalized,
        errorCode: "public-reverted",
      }),
    );
    if (updated) await releaseClaim(updated);
    return;
  }
  const blockNumber = serializedUint(args.receipt?.blockNumber);
  const event = decodePrivacyRagequitReceiptEvent(args.receipt);
  if (!blockNumber || !event) {
    await updatePrivacyRagequitTracking(args.txId, (current) =>
      advance(current, "public_confirmed", {
        txHash: normalized,
        blockNumber,
        errorCode: "event-unavailable",
      }),
    );
    return;
  }
  try {
    const finalized = await finalizeRecovery(operation, event);
    await updatePrivacyRagequitTracking(args.txId, (current) =>
      advance(current, finalized ? "recovered" : "public_confirmed", {
        txHash: normalized,
        blockNumber,
        errorCode: finalized ? null : "event-unavailable",
      }),
    );
  } catch {
    await updatePrivacyRagequitTracking(args.txId, (current) =>
      advance(current, "failed_recoverable", {
        txHash: normalized,
        blockNumber,
        errorCode: "event-mismatch",
      }),
    );
  }
}

export async function reconcilePrivacyRagequitEvents(): Promise<void> {
  const [operations, events] = await Promise.all([
    listAllPrivacyRagequits(),
    listPrivacyRagequitEvents(),
  ]);
  const byHash = new Map(events.map((event) => [event.transactionHash.toLowerCase(), event]));
  for (const operation of operations) {
    const txHash = operation.tracking.txHash?.toLowerCase();
    if (!txHash || operation.tracking.state === "recovered") continue;
    const event = byHash.get(txHash);
    if (!event) continue;
    try {
      if (!(await finalizeRecovery(operation, event))) continue;
      await updatePrivacyRagequitTracking(operation.summary.id, (current) =>
        advance(current, "recovered", {
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          errorCode: null,
        }),
      );
    } catch {
      await updatePrivacyRagequitTracking(operation.summary.id, (current) =>
        advance(current, "failed_recoverable", {
          errorCode: "event-mismatch",
        }),
      );
    }
  }
}

export async function resumePrivacyRagequitTracking(): Promise<void> {
  const operations = await listAllPrivacyRagequits();
  for (const operation of operations) {
    if (
      operation.tracking.txHash &&
      (operation.tracking.state === "submitted" ||
        operation.tracking.state === "submission_unknown")
    ) {
      startReceiptPolling(
        operation.summary.id,
        operation.tracking.txHash,
        operation.summary.chainId,
      );
    }
  }
  await reconcilePrivacyRagequitEvents();
}
