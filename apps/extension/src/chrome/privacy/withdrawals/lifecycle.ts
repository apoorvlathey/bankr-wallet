import { decodeEventLog, parseAbi, type Hex } from "viem";

import { fetchRpcResult } from "../../network/rpcClient";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import { assertPrivacyMasterAuthorization } from "../authorization";
import {
  applyPrivacyCommitmentWithdrawal,
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { listPrivacyWithdrawalEvents } from "../events/repository";
import { syncPrivacyDepositEvents } from "../events/sync";
import type { PrivacyWithdrawalEventV1 } from "../events/types";
import { discardPrivacyPortfolioReservationWindow } from "../portfolioHistory/repository";
import { isPrivacyNullifierSpent } from "./onchain";
import { decryptPrivacyUnshieldDetails } from "./crypto";
import {
  getPrivacyUnshieldById,
  listAllPrivacyUnshields,
  updatePrivacyUnshieldTracking,
} from "./repository";
import {
  isWalletRejectedPrivacyUnshield,
  type PrivacyAnyUnshieldDetailsV1,
  type PrivacyUnshieldState,
  type PrivacyUnshieldTrackingV1,
  type StoredPrivacyUnshieldV1,
} from "./types";
import {
  getPendingTxRequestById,
  type PendingTxRequest,
} from "../../requests/pendingTxStorage";
import {
  isPrivacyDirectUnshieldPending,
  revalidatePrivacyDirectUnshieldConfirmation,
  type PrivacyDirectUnshieldAuthorization,
} from "./directConfirmation";

const WITHDRAW_EVENT_ABI = parseAbi([
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
]);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const active = new Set<string>();
const DIRECT_CONFIRMATION_HANDOFF_GRACE_MS = 60_000;

function advance(
  current: Readonly<PrivacyUnshieldTrackingV1>,
  state: PrivacyUnshieldState,
  patch: Partial<Omit<PrivacyUnshieldTrackingV1, "version" | "revision" | "state" | "updatedAt">> = {},
): PrivacyUnshieldTrackingV1 {
  return {
    ...current,
    ...patch,
    version: 1,
    revision: current.revision + 1,
    state,
    updatedAt: Math.max(Date.now(), current.updatedAt),
  };
}

async function setState(
  id: string,
  state: PrivacyUnshieldState,
  patch: Partial<Omit<PrivacyUnshieldTrackingV1, "version" | "revision" | "state" | "updatedAt">> = {},
): Promise<void> {
  const updated = await updatePrivacyUnshieldTracking(id, (current) => advance(current, state, patch));
  if (!updated) throw new Error("Unshield operation is unavailable");
}

async function releasePendingCommitment(
  operation: StoredPrivacyUnshieldV1,
  details: PrivacyAnyUnshieldDetailsV1,
): Promise<void> {
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) return;
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const commitment = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === details.commitmentId);
    if (
      commitment?.details.status === "withdrawal_pending" &&
      commitment.details.commitment === details.commitmentHash
    ) {
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        commitment.record.id,
        "private_ready",
        {
          revision: details.commitmentRevision + 1,
          status: "withdrawal_pending",
        },
      );
    }
  });
}

/** Public receipt binding remains available while encrypted lineage is locked. */
export function isPrivacyUnshieldPublicEventMatch(
  operation: Pick<StoredPrivacyUnshieldV1, "summary">,
  event: Pick<PrivacyWithdrawalEventV1, "processooor" | "valueWei">,
): boolean {
  const expectedProcessooor = operation.summary.method === "direct"
    ? operation.summary.recipient
    : PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address;
  return event.processooor.toLowerCase() === expectedProcessooor.toLowerCase() &&
    event.valueWei === operation.summary.amountWei;
}

async function applyVerifiedWithdrawal(
  operation: StoredPrivacyUnshieldV1,
  details: PrivacyAnyUnshieldDetailsV1,
  event: PrivacyWithdrawalEventV1,
): Promise<void> {
  if (
    !isPrivacyUnshieldPublicEventMatch(operation, event) ||
    event.spentNullifier !== details.expectedSpentNullifier ||
    event.newCommitment !== details.expectedNewCommitment
  ) throw new Error("Unshield event did not match the approved intent");
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) {
    await setState(operation.summary.id, "public_confirmed", {
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      errorCode: null,
    });
    return;
  }
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const commitments = await readPrivacyCommitments(material.key, material.keyId);
    const current = commitments.find((item) =>
      item.record.id === details.commitmentId
    );
    const replacement = commitments.find((item) =>
      item.details.commitment === details.expectedNewCommitment &&
      item.details.balanceWei === details.expectedNewBalanceWei &&
      item.details.withdrawalIndex === details.expectedNewWithdrawalIndex &&
      (item.details.status === "private_ready" || item.details.status === "spent")
    );
    if (
      replacement ||
      (current?.details.commitment === details.expectedNewCommitment &&
        current.details.balanceWei === details.expectedNewBalanceWei &&
        current.details.withdrawalIndex === details.expectedNewWithdrawalIndex &&
        (current.details.status === "private_ready" || current.details.status === "spent"))
    ) {
      await setState(operation.summary.id, "private_balance_updated", {
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        errorCode: null,
      });
      return;
    }
    await applyPrivacyCommitmentWithdrawal(
      material.key,
      material.keyId,
      {
        commitmentId: details.commitmentId,
        expectedRevision: details.commitmentRevision + 1,
        expectedCommitment: details.commitmentHash,
        expectedBalanceWei: details.balanceWei,
        expectedWithdrawalIndex: details.withdrawalIndex,
        newCommitment: details.expectedNewCommitment,
        newBalanceWei: details.expectedNewBalanceWei,
        newWithdrawalIndex: details.expectedNewWithdrawalIndex,
      },
    );
    await setState(operation.summary.id, "private_balance_updated", {
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
      errorCode: null,
    });
  });
}

export function decodePrivacyUnshieldReceiptEvent(
  receipt: Record<string, unknown>,
  txHash: Hex,
): PrivacyWithdrawalEventV1 | null {
  const blockNumber = receiptUint(receipt.blockNumber);
  const blockHash = receipt.blockHash;
  if (
    blockNumber === null ||
    typeof blockHash !== "string" || !HASH.test(blockHash) ||
    !Array.isArray(receipt.logs)
  ) return null;
  for (const raw of receipt.logs) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const log = raw as Record<string, unknown>;
    try {
      if (
        typeof log.address !== "string" ||
        log.address.toLowerCase() !== PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase() ||
        typeof log.data !== "string" || !Array.isArray(log.topics)
      ) continue;
      const logIndex = receiptUint(log.logIndex);
      if (logIndex === null || logIndex > BigInt(Number.MAX_SAFE_INTEGER)) continue;
      const decoded = decodeEventLog({
        abi: WITHDRAW_EVENT_ABI,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      const args = decoded.args as {
        _processooor: `0x${string}`;
        _value: bigint;
        _spentNullifier: bigint;
        _newCommitment: bigint;
      };
      return {
        version: 1,
        id: `${txHash}:${logIndex.toString()}`,
        chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
        blockNumber: blockNumber.toString(),
        blockHash: blockHash.toLowerCase() as Hex,
        logIndex: Number(logIndex),
        transactionHash: txHash,
        processooor: args._processooor.toLowerCase() as `0x${string}`,
        valueWei: args._value.toString(),
        spentNullifier: args._spentNullifier.toString(),
        newCommitment: args._newCommitment.toString(),
      };
    } catch {
      // Ignore unrelated logs.
    }
  }
  return null;
}

function receiptUint(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (
    typeof value !== "string" ||
    !/^(?:0x[0-9a-fA-F]+|0|[1-9][0-9]*)$/.test(value)
  ) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function applyPrivacyUnshieldReceipt(
  operationId: string,
  txHash: Hex,
  receipt: Record<string, unknown>,
): Promise<void> {
  const operation = await getPrivacyUnshieldById(operationId);
  if (!operation || operation.tracking.txHash?.toLowerCase() !== txHash.toLowerCase()) return;
  const material = await readPrivacyAspMasterMaterial();
  const details = material && material.keyId === operation.keyId
    ? await decryptPrivacyUnshieldDetails(material.key, operation)
    : null;
  const status = receipt.status;
  if (status === "0x0") {
    if (details) await releasePendingCommitment(operation, details);
    await setState(operationId, "public_reverted", { errorCode: "public-reverted" });
    return;
  }
  if (status !== "0x1") return;
  const event = decodePrivacyUnshieldReceiptEvent(receipt, txHash);
  if (!event) {
    await setState(operationId, "failed_recoverable", { errorCode: "event-unavailable" });
    return;
  }
  if (!isPrivacyUnshieldPublicEventMatch(operation, event)) {
    await setState(operationId, "failed_recoverable", { errorCode: "event-mismatch" });
    return;
  }
  if (!details) {
    await setState(operationId, "public_confirmed", {
      blockNumber: event.blockNumber,
      errorCode: null,
    });
    return;
  }
  await applyVerifiedWithdrawal(operation, details, event);
}

/** Mirror the canonical wallet receipt into the richer Private Activity operation. */
export async function applyPrivacyUnshieldReceiptMirror(args: {
  txId: string;
  txHash: string;
  chainId: number;
  receipt: unknown;
  succeeded: boolean;
}): Promise<void> {
  if (
    args.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    !HASH.test(args.txHash) ||
    !args.receipt || typeof args.receipt !== "object" ||
    Array.isArray(args.receipt)
  ) return;
  await applyPrivacyUnshieldReceipt(
    args.txId,
    args.txHash.toLowerCase() as Hex,
    {
      ...(args.receipt as Record<string, unknown>),
      status: args.succeeded ? "0x1" : "0x0",
    },
  );
}

async function poll(operationId: string, txHash: Hex): Promise<void> {
  if (active.has(operationId)) return;
  active.add(operationId);
  try {
    const rpcUrl = await resolvePrivacyPoolsRpcUrl();
    const receipt = await fetchRpcResult(rpcUrl, "eth_getTransactionReceipt", [txHash], {
      allowPrivateWithoutOrigin: true,
      timeoutMs: 12_000,
      maxResponseBytes: 2_000_000,
    });
    if (receipt && typeof receipt === "object" && !Array.isArray(receipt)) {
      await applyPrivacyUnshieldReceipt(operationId, txHash, receipt as Record<string, unknown>);
      return;
    }
  } catch {
    // A later poll or startup recovery retries without changing state.
  } finally {
    active.delete(operationId);
  }
  setTimeout(() => void poll(operationId, txHash), 5_000);
}

export function startPrivacyUnshieldReceiptTracking(
  operationId: string,
  txHash: Hex,
): void {
  void poll(operationId, txHash);
}

export async function beginPrivacyDirectUnshieldSubmission(
  pending: PendingTxRequest,
  authorization: PrivacyDirectUnshieldAuthorization | null,
): Promise<void> {
  if (!isPrivacyDirectUnshieldPending(pending)) return;
  if (!authorization || authorization.operationId !== pending.id) {
    throw new Error("Receiver-paid Unshield authorization is unavailable");
  }
  await revalidatePrivacyDirectUnshieldConfirmation(pending, authorization);
  const updated = await updatePrivacyUnshieldTracking(pending.id, (current) => {
    if (current.state === "submission_unknown") return null;
    if (current.state !== "awaiting_wallet_confirmation") {
      throw new Error("Receiver-paid Unshield is no longer confirmable");
    }
    return advance(current, "submission_unknown", { errorCode: "submission-unknown" });
  });
  if (!updated) throw new Error("Receiver-paid Unshield is unavailable");
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
}

export async function recordPrivacyDirectUnshieldSubmitted(
  pending: PendingTxRequest,
  txHash: unknown,
): Promise<void> {
  if (!isPrivacyDirectUnshieldPending(pending)) return;
  if (typeof txHash !== "string" || !HASH.test(txHash)) {
    throw new Error("Receiver-paid Unshield transaction hash is invalid");
  }
  const normalized = txHash.toLowerCase() as Hex;
  const updated = await updatePrivacyUnshieldTracking(pending.id, (current) => {
    if (current.txHash && current.txHash.toLowerCase() !== normalized) {
      throw new Error("Receiver-paid Unshield transaction hash changed");
    }
    if (current.state !== "submission_unknown" && current.state !== "submitted") {
      throw new Error("Receiver-paid Unshield cannot accept a transaction hash");
    }
    if (current.state === "submitted" && current.txHash === normalized) return null;
    return advance(current, "submitted", { txHash: normalized, errorCode: null });
  });
  if (!updated) throw new Error("Receiver-paid Unshield is unavailable");
  startPrivacyUnshieldReceiptTracking(pending.id, normalized);
}

export async function recordPrivacyDirectUnshieldWalletRejected(
  pending: PendingTxRequest,
): Promise<void> {
  if (!isPrivacyDirectUnshieldPending(pending)) return;
  const operation = await getPrivacyUnshieldById(pending.id);
  if (!operation) return;
  const material = await readPrivacyAspMasterMaterial();
  const details = material && material.keyId === operation.keyId
    ? await decryptPrivacyUnshieldDetails(material.key, operation)
    : null;
  const updated = await updatePrivacyUnshieldTracking(pending.id, (current) =>
    current.state === "awaiting_wallet_confirmation"
      ? advance(current, "failed_recoverable", { errorCode: "wallet-rejected" })
      : null,
  );
  if (updated && details && material) {
    await releasePendingCommitment(updated, details);
    await discardPrivacyPortfolioReservationWindow(
      material.key,
      material.keyId,
      operation.summary.createdAt,
      updated.tracking.updatedAt,
    ).catch(() => undefined);
  }
}

export function getPrivacyDirectUnshieldFailureTracking(
  current: Readonly<PrivacyUnshieldTrackingV1>,
  outcomeUncertain: boolean,
): PrivacyUnshieldTrackingV1 | null {
  if (current.state === "submitted" || current.txHash) return null;
  if (current.state === "submission_unknown" && outcomeUncertain) return null;
  return current.state === "awaiting_wallet_confirmation" ||
      current.state === "submission_unknown"
    ? advance(current, "failed_recoverable", { errorCode: "submission-failed" })
    : null;
}

export async function recordPrivacyDirectUnshieldSubmissionFailure(
  pending: PendingTxRequest,
  options: { outcomeUncertain?: boolean } = {},
): Promise<void> {
  if (!isPrivacyDirectUnshieldPending(pending)) return;
  const operation = await getPrivacyUnshieldById(pending.id);
  if (!operation) return;
  const material = await readPrivacyAspMasterMaterial();
  const details = material && material.keyId === operation.keyId
    ? await decryptPrivacyUnshieldDetails(material.key, operation)
    : null;
  const updated = await updatePrivacyUnshieldTracking(pending.id, (current) =>
    getPrivacyDirectUnshieldFailureTracking(
      current,
      options.outcomeUncertain === true,
    )
  );
  if (updated && details) await releasePendingCommitment(updated, details);
}

async function reconcileWithoutHash(operation: StoredPrivacyUnshieldV1): Promise<void> {
  if (isWalletRejectedPrivacyUnshield(operation)) return;
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) return;
  const details = await decryptPrivacyUnshieldDetails(material.key, operation);
  if (!details) return;
  const spent = await isPrivacyNullifierSpent(BigInt(details.expectedSpentNullifier));
  if (spent) {
    const sync = await syncPrivacyDepositEvents();
    if (sync.status !== "current") return;
    const event = (await listPrivacyWithdrawalEvents()).find(
      (candidate) => candidate.spentNullifier === details.expectedSpentNullifier,
    );
    if (event) await applyVerifiedWithdrawal(operation, details, event);
    return;
  }
  if (
    operation.tracking.state === "proof_preparing" ||
    operation.tracking.state === "proof_verified" ||
    (operation.summary.method === "direct" &&
      operation.tracking.state === "failed_recoverable") ||
    (operation.tracking.state === "submitting_to_relayer" &&
      Date.now() - operation.tracking.updatedAt > 5 * 60_000)
  ) {
    await releasePendingCommitment(operation, details);
    await discardPrivacyPortfolioReservationWindow(
      material.key,
      material.keyId,
      operation.summary.createdAt,
      Date.now(),
    ).catch(() => undefined);
    await setState(operation.summary.id, "failed_recoverable", {
      errorCode: "interrupted-before-submission",
    });
  }
}

export function isAbandonedPrivacyDirectUnshieldConfirmation(
  operation: Pick<StoredPrivacyUnshieldV1, "summary" | "tracking">,
  pendingExists: boolean,
  now = Date.now(),
): boolean {
  return operation.summary.method === "direct" &&
    operation.tracking.state === "awaiting_wallet_confirmation" &&
    operation.tracking.txHash === null &&
    !pendingExists &&
    now >= operation.summary.expiresAt + DIRECT_CONFIRMATION_HANDOFF_GRACE_MS;
}

/** Resume receipt and nullifier-aware reconciliation after worker restart/unlock. */
export async function resumePrivacyUnshieldTracking(): Promise<void> {
  const operations = await listAllPrivacyUnshields();
  const receiptPolls: Promise<void>[] = [];
  for (const operation of operations) {
    const txHash = operation.tracking.txHash;
    if (
      !txHash && operation.summary.method === "direct" &&
      operation.tracking.state === "awaiting_wallet_confirmation"
    ) {
      const pending = await getPendingTxRequestById(operation.summary.id);
      const exactPending = pending && isPrivacyDirectUnshieldPending(pending);
      if (isAbandonedPrivacyDirectUnshieldConfirmation(operation, Boolean(exactPending))) {
        await setState(operation.summary.id, "failed_recoverable", {
          errorCode: "interrupted-before-confirmation",
        }).catch(() => undefined);
        const updated = await getPrivacyUnshieldById(operation.summary.id);
        if (updated) void reconcileWithoutHash(updated).catch(() => undefined);
      }
      continue;
    }
    if (
      txHash &&
      (operation.tracking.state === "submitted" ||
        operation.tracking.state === "public_confirmed" ||
        operation.tracking.state === "failed_recoverable")
    ) {
      receiptPolls.push(poll(operation.summary.id, txHash));
    } else if (
      !txHash &&
      (operation.tracking.state === "submission_unknown" ||
        operation.tracking.state === "submitting_to_relayer" ||
        operation.tracking.state === "proof_preparing" ||
        operation.tracking.state === "proof_verified" ||
        (operation.summary.method === "direct" &&
          operation.tracking.state === "failed_recoverable"))
    ) {
      void reconcileWithoutHash(operation).catch(() => undefined);
    }
  }
  await Promise.all(receiptPolls);
}
