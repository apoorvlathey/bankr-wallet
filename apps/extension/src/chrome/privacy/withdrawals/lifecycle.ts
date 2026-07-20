import { decodeEventLog, parseAbi, type Hex } from "viem";

import { fetchRpcResult } from "../../network/rpcClient";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
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
import { isPrivacyNullifierSpent } from "./onchain";
import { decryptPrivacyUnshieldDetails } from "./crypto";
import {
  getPrivacyUnshieldById,
  listAllPrivacyUnshields,
  updatePrivacyUnshieldTracking,
} from "./repository";
import type {
  PrivacyUnshieldDetailsV1,
  PrivacyUnshieldState,
  PrivacyUnshieldTrackingV1,
  StoredPrivacyUnshieldV1,
} from "./types";

const WITHDRAW_EVENT_ABI = parseAbi([
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
]);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const active = new Set<string>();

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
  details: PrivacyUnshieldDetailsV1,
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
      );
    }
  });
}

async function applyVerifiedWithdrawal(
  operation: StoredPrivacyUnshieldV1,
  details: PrivacyUnshieldDetailsV1,
  event: PrivacyWithdrawalEventV1,
): Promise<void> {
  if (
    event.processooor.toLowerCase() !==
      PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address.toLowerCase() ||
    event.valueWei !== operation.summary.amountWei ||
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
    const current = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === details.commitmentId);
    if (
      current?.details.commitment === details.expectedNewCommitment &&
      current.details.balanceWei === details.expectedNewBalanceWei &&
      current.details.withdrawalIndex === details.expectedNewWithdrawalIndex &&
      (current.details.status === "private_ready" || current.details.status === "spent")
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

function eventFromReceipt(
  receipt: Record<string, unknown>,
  txHash: Hex,
): PrivacyWithdrawalEventV1 | null {
  const blockNumber = typeof receipt.blockNumber === "string"
    ? BigInt(receipt.blockNumber)
    : null;
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
        typeof log.logIndex !== "string" ||
        typeof log.data !== "string" || !Array.isArray(log.topics)
      ) continue;
      const logIndex = BigInt(log.logIndex);
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
  const event = eventFromReceipt(receipt, txHash);
  if (!event) {
    await setState(operationId, "failed_recoverable", { errorCode: "event-unavailable" });
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

async function reconcileWithoutHash(operation: StoredPrivacyUnshieldV1): Promise<void> {
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
    (operation.tracking.state === "submitting_to_relayer" &&
      Date.now() - operation.tracking.updatedAt > 5 * 60_000)
  ) {
    await releasePendingCommitment(operation, details);
    await setState(operation.summary.id, "failed_recoverable", {
      errorCode: "interrupted-before-submission",
    });
  }
}

/** Resume receipt and nullifier-aware reconciliation after worker restart/unlock. */
export async function resumePrivacyUnshieldTracking(): Promise<void> {
  const operations = await listAllPrivacyUnshields();
  for (const operation of operations) {
    const txHash = operation.tracking.txHash;
    if (
      txHash &&
      (operation.tracking.state === "submitted" ||
        operation.tracking.state === "public_confirmed" ||
        operation.tracking.state === "failed_recoverable")
    ) {
      startPrivacyUnshieldReceiptTracking(operation.summary.id, txHash);
    } else if (
      !txHash &&
      (operation.tracking.state === "submission_unknown" ||
        operation.tracking.state === "submitting_to_relayer" ||
        operation.tracking.state === "proof_preparing" ||
        operation.tracking.state === "proof_verified")
    ) {
      void reconcileWithoutHash(operation).catch(() => undefined);
    }
  }
}
