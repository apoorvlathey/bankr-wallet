import { decodeEventLog, parseAbi, type Hex } from "viem";

import { startReceiptPolling } from "../../forceInclusion/receiptPoller";
import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import type { PendingBatchTxRequest } from "../../erc5792Types";
import {
  applyPrivacyCommitmentRagequit,
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
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
  revalidatePrivacyRagequitBatchConfirmation,
  isPrivacyRagequitPendingTransaction,
  revalidatePrivacyRagequitConfirmation,
  type PrivacyRagequitBatchAuthorization,
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
      {
        revision: details.commitmentRevision + 1,
        status: "ragequit_pending",
      },
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

function isPrivacyRagequitBatch(
  pending: PendingBatchTxRequest,
): pending is PendingBatchTxRequest & {
  privacyRagequitMeta: { version: 1; operationIds: string[] };
} {
  return pending.privacyRagequitMeta?.version === 1 &&
    pending.privacyRagequitMeta.operationIds.length >= 2;
}

async function updateBatchOperations(
  pending: PendingBatchTxRequest,
  update: Parameters<typeof updatePrivacyRagequitTracking>[1],
): Promise<StoredPrivacyRagequitV1[]> {
  if (!isPrivacyRagequitBatch(pending)) return [];
  const records = await listAllPrivacyRagequits();
  const batchRecords = records.filter((operation) =>
    operation.summary.batchId === pending.id
  );
  const operationIds = pending.privacyRagequitMeta.operationIds;
  if (
    new Set(operationIds).size !== operationIds.length ||
    batchRecords.length !== operationIds.length ||
    pending.params.atomicRequired !== true ||
    pending.params.calls.length !== operationIds.length ||
    operationIds.some((id, index) => batchRecords.find(
      (operation) => operation.summary.id === id,
    )?.summary.id !== id || !pending.params.calls[index]) ||
    batchRecords.some((operation) =>
      operation.summary.accountId !== pending.accountId ||
      operation.summary.accountType !== pending.accountType ||
      operation.summary.accountAddress.toLowerCase() !==
        pending.accountAddress?.toLowerCase() ||
      operation.summary.accountAddress.toLowerCase() !==
        pending.params.from?.toLowerCase()
    )
  ) throw new Error("Public recovery batch binding is invalid");
  const updated: StoredPrivacyRagequitV1[] = [];
  for (const operationId of operationIds) {
    const operation = await updatePrivacyRagequitTracking(operationId, update);
    if (!operation) throw new Error("Public recovery is unavailable");
    updated.push(operation);
  }
  return updated;
}

export async function beginPrivacyRagequitBatchSubmission(
  pending: PendingBatchTxRequest,
  authorization: PrivacyRagequitBatchAuthorization | null,
): Promise<void> {
  if (!isPrivacyRagequitBatch(pending)) return;
  if (!authorization || authorization.batchId !== pending.id) {
    throw new Error("Public recovery authorization is unavailable");
  }
  await revalidatePrivacyRagequitBatchConfirmation(pending, authorization);
  await updateBatchOperations(pending, (current) => {
    if (current.state === "submission_unknown") return null;
    if (current.state !== "awaiting_wallet_confirmation") {
      throw new Error("Public recovery is no longer confirmable");
    }
    return advance(current, "submission_unknown", { errorCode: "submission-unknown" });
  });
  assertPrivacyRagequitAuthorization({
    operationId: authorization.operationIds[0],
    expectedAuthEpoch: authorization.expectedAuthEpoch,
  });
}

export async function recordPrivacyRagequitBatchSubmitted(
  pending: PendingBatchTxRequest,
  txHash: unknown,
): Promise<void> {
  if (!isPrivacyRagequitBatch(pending)) return;
  const normalized = normalizedHash(txHash);
  if (!normalized) throw new Error("Public recovery transaction hash is invalid");
  await updateBatchOperations(pending, (current) => {
    if (current.txHash && current.txHash.toLowerCase() !== normalized) {
      throw new Error("Public recovery transaction hash changed");
    }
    if (current.state !== "submission_unknown" && current.state !== "submitted") {
      throw new Error("Public recovery cannot accept a transaction hash");
    }
    if (current.state === "submitted" && current.txHash === normalized) return null;
    return advance(current, "submitted", { txHash: normalized, errorCode: null });
  });
}

export async function recordPrivacyRagequitBatchWalletRejected(
  pending: PendingBatchTxRequest,
): Promise<void> {
  if (!isPrivacyRagequitBatch(pending)) return;
  const operations = await updateBatchOperations(pending, (current) =>
    current.state === "awaiting_wallet_confirmation"
      ? advance(current, "wallet_rejected", { errorCode: "wallet-rejected" })
      : null,
  );
  for (const operation of operations) {
    if (operation.tracking.state === "wallet_rejected") await releaseClaim(operation);
  }
}

export async function recordPrivacyRagequitBatchSubmissionFailure(
  pending: PendingBatchTxRequest,
): Promise<void> {
  if (!isPrivacyRagequitBatch(pending)) return;
  const operations = await updateBatchOperations(pending, (current) => {
    if (current.state === "submission_unknown" || current.state === "submitted") return null;
    return current.state === "awaiting_wallet_confirmation"
      ? advance(current, "submission_failed", { errorCode: "submission-failed" })
      : null;
  });
  for (const operation of operations) {
    if (operation.tracking.state === "submission_failed") await releaseClaim(operation);
  }
}

export async function recordPrivacyRagequitDropped(
  operationId: string,
  txHash: unknown,
): Promise<void> {
  const normalized = normalizedHash(txHash);
  if (!normalized) return;
  const operations = await listAllPrivacyRagequits();
  const ids = operations
    .filter((operation) =>
      operation.summary.id === operationId || operation.summary.batchId === operationId
    )
    .map((operation) => operation.summary.id);
  for (const id of ids) {
    await updatePrivacyRagequitTracking(id, (current) => {
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
}

type DecodedRagequitEvent = Omit<PrivacyRagequitEventV1, "version" | "id" | "chainId" | "blockHash" | "blockNumber" | "logIndex" | "transactionHash">;

export function decodePrivacyRagequitReceiptEvents(receipt: any): DecodedRagequitEvent[] {
  if (!Array.isArray(receipt?.logs)) return [];
  const events: DecodedRagequitEvent[] = [];
  for (const log of receipt.logs) {
    try {
      if (
        typeof log?.address !== "string" ||
        log.address.toLowerCase() !==
          PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase()
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
      events.push({
        ragequitter: args._ragequitter,
        commitment: args._commitment.toString(),
        label: args._label.toString(),
        valueWei: args._value.toString(),
      });
    } catch {
      // Ignore unrelated logs.
    }
  }
  return events;
}

export function decodePrivacyRagequitReceiptEvent(receipt: any): DecodedRagequitEvent | null {
  return decodePrivacyRagequitReceiptEvents(receipt)[0] ?? null;
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
  if (!normalized || args.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId) return;
  const operations = await listAllPrivacyRagequits();
  const matchingOperations = operations.filter((item) =>
    item.summary.id === args.txId || item.summary.batchId === args.txId
  );
  if (matchingOperations.length === 0) return;
  if (matchingOperations.some((operation) =>
    operation.tracking.txHash && operation.tracking.txHash.toLowerCase() !== normalized
  )) throw new Error("Public recovery receipt transaction hash changed");
  if (!args.succeeded) {
    for (const operation of matchingOperations) {
      const updated = await updatePrivacyRagequitTracking(operation.summary.id, (current) =>
        advance(current, "public_reverted", {
          txHash: normalized,
          errorCode: "public-reverted",
        }),
      );
      if (updated) await releaseClaim(updated);
    }
    return;
  }
  const blockNumber = serializedUint(args.receipt?.blockNumber);
  const events = decodePrivacyRagequitReceiptEvents(args.receipt);
  if (!blockNumber || events.length < matchingOperations.length) {
    for (const operation of matchingOperations) {
      await updatePrivacyRagequitTracking(operation.summary.id, (current) =>
        advance(current, "public_confirmed", {
          txHash: normalized,
          blockNumber,
          errorCode: "event-unavailable",
        }),
      );
    }
    return;
  }
  const unused = [...events];
  for (const operation of matchingOperations) {
    let matchedIndex = -1;
    for (let index = 0; index < unused.length; index += 1) {
      try {
        if (await finalizeRecovery(operation, unused[index])) {
          matchedIndex = index;
          break;
        }
      } catch {
        // Keep searching: another event in this atomic receipt may be exact.
      }
    }
    if (matchedIndex >= 0) unused.splice(matchedIndex, 1);
    await updatePrivacyRagequitTracking(operation.summary.id, (current) =>
      advance(current, matchedIndex >= 0 ? "recovered" : "failed_recoverable", {
        txHash: normalized,
        blockNumber,
        errorCode: matchedIndex >= 0 ? null : "event-mismatch",
      }),
    );
  }
}

export async function reconcilePrivacyRagequitEvents(): Promise<void> {
  const [operations, events] = await Promise.all([
    listAllPrivacyRagequits(),
    listPrivacyRagequitEvents(),
  ]);
  const byHash = new Map<string, PrivacyRagequitEventV1[]>();
  for (const event of events) {
    const hash = event.transactionHash.toLowerCase();
    byHash.set(hash, [...(byHash.get(hash) ?? []), event]);
  }
  for (const operation of operations) {
    const txHash = operation.tracking.txHash?.toLowerCase();
    if (!txHash || operation.tracking.state === "recovered") continue;
    const candidates = byHash.get(txHash);
    if (!candidates?.length) continue;
    try {
      let event: PrivacyRagequitEventV1 | null = null;
      for (const candidate of candidates) {
        try {
          if (await finalizeRecovery(operation, candidate)) {
            event = candidate;
            break;
          }
        } catch {
          // Search every event sharing the atomic batch hash.
        }
      }
      if (!event) throw new Error("Public recovery event does not match");
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
  const resumed = new Set<string>();
  for (const operation of operations) {
    if (
      operation.tracking.txHash &&
      (operation.tracking.state === "submitted" ||
        operation.tracking.state === "submission_unknown")
    ) {
      const trackingId = operation.summary.batchId ?? operation.summary.id;
      if (resumed.has(trackingId)) continue;
      resumed.add(trackingId);
      startReceiptPolling(
        trackingId,
        operation.tracking.txHash,
        operation.summary.chainId,
      );
    }
  }
  await reconcilePrivacyRagequitEvents();
}
