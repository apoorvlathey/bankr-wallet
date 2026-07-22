import { decodeFunctionData, type Hex } from "viem";

import { pinnedTxRequest } from "../../requests/pinnedRequest";
import {
  getPendingTxRequestById,
  savePendingTxRequest,
  type PendingTxRequest,
} from "../../requests/pendingTxStorage";
import { WALLET_SECRET_OPERATION_LOCK_KEY, withStorageLock } from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import { readPrivacyAspOnchainRoots } from "../asp/onchain";
import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { decryptPrivacyUnshieldDetails } from "./crypto";
import { PRIVACY_DIRECT_WITHDRAW_ABI, resolveDirectAccount } from "./direct";
import { deletePrivacyUnshield, getPrivacyUnshieldById } from "./repository";
import type {
  PrivacyDirectUnshieldDetailsV1,
  PrivacyDirectUnshieldSummaryV1,
  StoredPrivacyUnshieldV1,
} from "./types";

async function loadDirectOperation(operationId: string) {
  const operation = await getPrivacyUnshieldById(operationId);
  if (
    !operation || operation.summary.method !== "direct" ||
    operation.tracking.state !== "awaiting_wallet_confirmation"
  ) throw new Error("operation-unavailable");
  const material = await readPrivacyAspMasterMaterial();
  if (!material || material.keyId !== operation.keyId) throw new Error("auth-required");
  const details = await decryptPrivacyUnshieldDetails(material.key, operation);
  if (!details || !("method" in details) || details.method !== "direct") {
    throw new Error("operation-unavailable");
  }
  const commitment = (await readPrivacyCommitments(material.key, material.keyId))
    .find((item) => item.record.id === details.commitmentId);
  if (
    !commitment || commitment.record.revision !== details.commitmentRevision + 1 ||
    commitment.details.status !== "withdrawal_pending" ||
    commitment.details.commitment !== details.commitmentHash ||
    commitment.details.balanceWei !== details.balanceWei
  ) throw new Error("operation-unavailable");
  try {
    const decoded = decodeFunctionData({ abi: PRIVACY_DIRECT_WITHDRAW_ABI, data: details.callData });
    if (
      decoded.functionName !== "withdraw" ||
      decoded.args[0].processooor.toLowerCase() !== operation.summary.accountAddress.toLowerCase() ||
      decoded.args[0].data !== "0x" ||
      decoded.args[1].pubSignals[0] !== BigInt(details.expectedNewCommitment) ||
      decoded.args[1].pubSignals[1] !== BigInt(details.expectedSpentNullifier) ||
      decoded.args[1].pubSignals[2] !== BigInt(operation.summary.amountWei) ||
      decoded.args[1].pubSignals[3] !== BigInt(details.stateRoot) ||
      decoded.args[1].pubSignals[5] !== BigInt(details.associationRoot)
    ) throw new Error("invalid");
  } catch {
    throw new Error("operation-unavailable");
  }
  return { operation, details: details as PrivacyDirectUnshieldDetailsV1 };
}

function exactDirectPending(
  pending: PendingTxRequest,
  operation: StoredPrivacyUnshieldV1 & { summary: PrivacyDirectUnshieldSummaryV1 },
  callData: Hex,
): boolean {
  return pending.id === operation.summary.id && pending.trustedInternal === true &&
    pending.privacyUnshieldMeta?.version === 1 &&
    pending.privacyUnshieldMeta.operationId === operation.summary.id &&
    pending.accountId === operation.summary.accountId &&
    pending.accountType === operation.summary.accountType &&
    pending.accountAddress?.toLowerCase() === operation.summary.accountAddress.toLowerCase() &&
    pending.tx.chainId === operation.summary.chainId &&
    pending.tx.from.toLowerCase() === operation.summary.accountAddress.toLowerCase() &&
    pending.tx.to?.toLowerCase() === PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase() &&
    BigInt(pending.tx.value ?? "0x0") === 0n &&
    pending.tx.data?.toLowerCase() === callData.toLowerCase();
}

export async function queuePrivacyDirectUnshieldConfirmation(operationId: string) {
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment();
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    assertPrivacyMasterAuthorization(expectedEpoch);
    const loaded = await loadDirectOperation(operationId);
    const operation = loaded.operation as StoredPrivacyUnshieldV1 & { summary: PrivacyDirectUnshieldSummaryV1 };
    const account = await resolveDirectAccount(operation.summary);
    const existing = await getPendingTxRequestById(operationId);
    if (existing) {
      if (!exactDirectPending(existing, operation, loaded.details.callData)) {
        throw new Error("operation-unavailable");
      }
      return operation;
    }
    const pending = pinnedTxRequest(account, {
      id: operation.summary.id,
      tx: {
        from: operation.summary.accountAddress,
        to: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
        data: loaded.details.callData,
        value: "0x0",
        chainId: operation.summary.chainId,
        gas: `0x${BigInt(operation.summary.gasLimit).toString(16)}`,
        maxFeePerGas: `0x${BigInt(operation.summary.maxFeePerGas).toString(16)}`,
      },
      origin: "WalletChan Receiver-paid Unshield",
      favicon: null,
      chainName: PRIVACY_POOLS_DEPLOYMENT.chainName,
      timestamp: Date.now(),
      trustedInternal: true,
      privacyUnshieldMeta: { version: 1, operationId: operation.summary.id },
    });
    assertPrivacyMasterAuthorization(expectedEpoch);
    await savePendingTxRequest(pending, expectedEpoch);
    void chrome.runtime.sendMessage({ type: "newPendingTxRequest", txRequest: pending }).catch(() => undefined);
    return operation;
  });
}

/** Release a newly claimed commitment if confirmation could not be queued. */
export async function rollbackPreparedPrivacyDirectUnshield(
  operationId: string,
): Promise<void> {
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const operation = await getPrivacyUnshieldById(operationId);
    if (
      !operation || operation.summary.method !== "direct" ||
      operation.tracking.state !== "awaiting_wallet_confirmation"
    ) return;
    const material = await readPrivacyAspMasterMaterial();
    if (!material || material.keyId !== operation.keyId) return;
    const details = await decryptPrivacyUnshieldDetails(material.key, operation);
    if (!details || !("method" in details) || details.method !== "direct") return;
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
    await deletePrivacyUnshield(operationId);
  });
}

export interface PrivacyDirectUnshieldAuthorization {
  operationId: string;
  expectedAuthEpoch: string;
}

export async function authorizePrivacyDirectUnshieldConfirmation(
  pending: PendingTxRequest,
): Promise<PrivacyDirectUnshieldAuthorization | null> {
  if (!pending.privacyUnshieldMeta) return null;
  const expectedAuthEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment();
  const loaded = await loadDirectOperation(pending.id);
  const operation = loaded.operation as StoredPrivacyUnshieldV1 & { summary: PrivacyDirectUnshieldSummaryV1 };
  if (!exactDirectPending(pending, operation, loaded.details.callData)) {
    throw new Error("operation-unavailable");
  }
  await resolveDirectAccount(operation.summary);
  const roots = await readPrivacyAspOnchainRoots({ expectedStateRoot: BigInt(loaded.details.stateRoot) });
  if (
    roots.associationRoot !== BigInt(loaded.details.associationRoot) ||
    roots.verifiedStateRoot !== BigInt(loaded.details.stateRoot)
  ) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(expectedAuthEpoch);
  return { operationId: pending.id, expectedAuthEpoch };
}

export async function revalidatePrivacyDirectUnshieldConfirmation(
  pending: PendingTxRequest,
  authorization: PrivacyDirectUnshieldAuthorization,
): Promise<void> {
  if (
    pending.privacyUnshieldMeta?.operationId !== pending.id ||
    authorization.operationId !== pending.id
  ) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
  const loaded = await loadDirectOperation(pending.id);
  const operation = loaded.operation as StoredPrivacyUnshieldV1 & { summary: PrivacyDirectUnshieldSummaryV1 };
  if (!exactDirectPending(pending, operation, loaded.details.callData)) {
    throw new Error("operation-unavailable");
  }
  const roots = await readPrivacyAspOnchainRoots({ expectedStateRoot: BigInt(loaded.details.stateRoot) });
  if (
    roots.associationRoot !== BigInt(loaded.details.associationRoot) ||
    roots.verifiedStateRoot !== BigInt(loaded.details.stateRoot)
  ) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
}

export function isPrivacyDirectUnshieldPending(pending: PendingTxRequest): boolean {
  return pending.privacyUnshieldMeta?.version === 1 &&
    pending.privacyUnshieldMeta.operationId === pending.id;
}
