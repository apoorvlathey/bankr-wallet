import { decodeFunctionData, toHex } from "viem";

import { getAccountById } from "../../accounts/repository";
import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import {
  getPendingTxRequestById,
  savePendingTxRequest,
} from "../../requests/pendingTxStorage";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import { getCachedPrivacyKey } from "../../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import {
  PRIVACY_POOLS_DEPLOYMENT,
  PRIVACY_POOLS_RELEASE_POLICY,
} from "../deployment/manifest";
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import { isPrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";
import { readPrivacyCommitments } from "../commitments/repository";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { decryptPrivacyRagequitDetails } from "./crypto";
import { PRIVACY_RAGEQUIT_ABI } from "./prepare";
import { getPrivacyRagequitById } from "./repository";
import {
  privacyRagequitPublicSummary,
  type StoredPrivacyRagequitV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PrivacyRagequitAuthorization {
  operationId: string;
  expectedAuthEpoch: string;
}

async function releaseDetails(operation: StoredPrivacyRagequitV1) {
  const [vault, privacyKey] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
  ]);
  if (
    vault.status !== "valid" || !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    operation.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) throw new Error("operation-unavailable");
  const details = await decryptPrivacyRagequitDetails(privacyKey.key, operation);
  if (!details) throw new Error("operation-unavailable");
  const commitment = (await readPrivacyCommitments(privacyKey.key, privacyKey.keyId))
    .find((item) => item.record.id === details.commitmentId);
  if (
    !commitment || commitment.record.revision !== details.commitmentRevision + 1 ||
    commitment.details.status !== "ragequit_pending" ||
    commitment.details.commitment !== details.commitmentHash ||
    commitment.details.balanceWei !== details.balanceWei ||
    commitment.details.depositor.toLowerCase() !== operation.summary.accountAddress.toLowerCase()
  ) throw new Error("operation-unavailable");
  try {
    const decoded = decodeFunctionData({ abi: PRIVACY_RAGEQUIT_ABI, data: details.callData });
    if (decoded.functionName !== "ragequit") throw new Error("Invalid function");
    const proof = decoded.args[0];
    if (
      proof.pubSignals[0] !== BigInt(details.commitmentHash) ||
      proof.pubSignals[1] !== BigInt(details.nullifierHash) ||
      proof.pubSignals[2] !== BigInt(details.balanceWei) ||
      proof.pubSignals[3] !== BigInt(details.label)
    ) throw new Error("Invalid public signals");
  } catch {
    throw new Error("operation-unavailable");
  }
  return details;
}

function exactPending(
  pending: PendingTxRequest,
  operation: StoredPrivacyRagequitV1,
  callData: string,
): boolean {
  return pending.id === operation.summary.id &&
    pending.trustedInternal === true &&
    pending.privacyRagequitMeta?.version === 1 &&
    pending.privacyRagequitMeta.operationId === operation.summary.id &&
    pending.accountId === operation.summary.accountId &&
    pending.accountType === operation.summary.accountType &&
    pending.accountAddress?.toLowerCase() === operation.summary.accountAddress.toLowerCase() &&
    pending.tx.chainId === operation.summary.chainId &&
    pending.tx.from.toLowerCase() === operation.summary.accountAddress.toLowerCase() &&
    pending.tx.to?.toLowerCase() === operation.summary.poolAddress.toLowerCase() &&
    BigInt(pending.tx.value ?? "0x0") === 0n &&
    pending.tx.data?.toLowerCase() === callData.toLowerCase();
}

async function loadOperation(operationId: string) {
  if (!UUID.test(operationId) || PRIVACY_POOLS_RELEASE_POLICY.mutations !== "enabled") {
    throw new Error("operation-unavailable");
  }
  const operation = await getPrivacyRagequitById(operationId);
  if (!operation || operation.tracking.state !== "awaiting_wallet_confirmation") {
    throw new Error("operation-unavailable");
  }
  return { operation, details: await releaseDetails(operation) };
}

export async function queuePrivacyRagequitConfirmation(operationId: string) {
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment().catch(() => {
    throw new Error("operation-unavailable");
  });
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    assertPrivacyMasterAuthorization(expectedEpoch);
    const { operation, details } = await loadOperation(operationId);
    const account = await getAccountById(operation.summary.accountId);
    if (
      !account || account.type === "impersonator" ||
      account.type !== operation.summary.accountType ||
      !isPrivacyPoolsMutationAccountType(account.type) ||
      account.address.toLowerCase() !== operation.summary.accountAddress.toLowerCase()
    ) throw new Error("operation-unavailable");
    const existing = await getPendingTxRequestById(operationId);
    if (existing) {
      if (!exactPending(existing, operation, details.callData)) {
        throw new Error("operation-unavailable");
      }
      return privacyRagequitPublicSummary(operation);
    }
    const pending = pinnedTxRequest(account, {
      id: operation.summary.id,
      tx: {
        from: operation.summary.accountAddress,
        to: operation.summary.poolAddress,
        data: details.callData,
        value: toHex(0n),
        chainId: operation.summary.chainId,
      },
      origin: "WalletChan Shield Recovery",
      favicon: null,
      chainName: PRIVACY_POOLS_DEPLOYMENT.chainName,
      timestamp: Date.now(),
      trustedInternal: true,
      privacyRagequitMeta: { version: 1, operationId: operation.summary.id },
    });
    assertPrivacyMasterAuthorization(expectedEpoch);
    await savePendingTxRequest(pending, expectedEpoch);
    void chrome.runtime.sendMessage({ type: "newPendingTxRequest", txRequest: pending })
      .catch(() => undefined);
    return privacyRagequitPublicSummary(operation);
  });
}

export async function authorizePrivacyRagequitConfirmation(
  pending: PendingTxRequest,
): Promise<PrivacyRagequitAuthorization | null> {
  if (!pending.privacyRagequitMeta) return null;
  if (
    pending.privacyRagequitMeta.version !== 1 ||
    pending.privacyRagequitMeta.operationId !== pending.id
  ) throw new Error("operation-unavailable");
  const expectedAuthEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment();
  const { operation, details } = await loadOperation(pending.id);
  if (!exactPending(pending, operation, details.callData)) {
    throw new Error("operation-unavailable");
  }
  assertPrivacyMasterAuthorization(expectedAuthEpoch);
  return { operationId: pending.id, expectedAuthEpoch };
}

export function assertPrivacyRagequitAuthorization(
  authorization: PrivacyRagequitAuthorization | null,
): void {
  if (!authorization) return;
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
}

/** Repeat the encrypted commitment and calldata checks at the final RPC boundary. */
export async function revalidatePrivacyRagequitConfirmation(
  pending: PendingTxRequest,
  authorization: PrivacyRagequitAuthorization,
): Promise<void> {
  if (
    !pending.privacyRagequitMeta ||
    authorization.operationId !== pending.id ||
    pending.privacyRagequitMeta.operationId !== pending.id
  ) throw new Error("operation-unavailable");
  assertPrivacyRagequitAuthorization(authorization);
  const { operation, details } = await loadOperation(pending.id);
  if (!exactPending(pending, operation, details.callData)) {
    throw new Error("operation-unavailable");
  }
  assertPrivacyRagequitAuthorization(authorization);
}

export function isPrivacyRagequitPendingTransaction(pending: PendingTxRequest): boolean {
  return pending.privacyRagequitMeta?.version === 1 &&
    pending.privacyRagequitMeta.operationId === pending.id;
}
