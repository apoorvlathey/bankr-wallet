import { decodeFunctionData, toHex } from "viem";
import { getStoredResolvedChainById } from "../../../lib/chains";
import { resolveActiveDelegate } from "../../../utils/delegationResolution";

import { getAccountById } from "../../accounts/repository";
import type { PendingTxRequest } from "../../requests/pendingTxStorage";
import type { PendingBatchTxRequest } from "../../erc5792Types";
import { BUNDLE_STATUS } from "../../erc5792Types";
import { saveBundleStatus } from "../../batch/bundleStatusStorage";
import {
  getPendingBatchTxRequestById,
  savePendingBatchTxRequest,
} from "../../requests/pendingBatchTxStorage";
import {
  getPendingTxRequestById,
  savePendingTxRequest,
} from "../../requests/pendingTxStorage";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import { pinnedBatchTxRequest } from "../../requests/pinnedRequest";
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
import { getPrivacyRagequitById, listAllPrivacyRagequits } from "./repository";
import {
  privacyRagequitPublicSummary,
  type StoredPrivacyRagequitV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PrivacyRagequitAuthorization {
  operationId: string;
  expectedAuthEpoch: string;
}

export interface PrivacyRagequitBatchAuthorization {
  batchId: string;
  operationIds: string[];
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

async function loadBatchOperations(
  batchId: string,
  operationIds: readonly string[],
) {
  if (
    PRIVACY_POOLS_RELEASE_POLICY.mutations !== "enabled" ||
    !UUID.test(batchId) ||
    operationIds.length < 2 ||
    operationIds.length > 8 ||
    new Set(operationIds).size !== operationIds.length ||
    operationIds.some((id) => !UUID.test(id))
  ) throw new Error("operation-unavailable");
  const records = await listAllPrivacyRagequits();
  const byId = new Map(records.map((record) => [record.summary.id, record]));
  const loaded = [] as Array<{
    operation: StoredPrivacyRagequitV1;
    details: Awaited<ReturnType<typeof releaseDetails>>;
  }>;
  for (const id of operationIds) {
    const operation = byId.get(id);
    if (
      !operation ||
      operation.summary.batchId !== batchId ||
      operation.tracking.state !== "awaiting_wallet_confirmation"
    ) throw new Error("operation-unavailable");
    loaded.push({ operation, details: await releaseDetails(operation) });
  }
  const first = loaded[0].operation.summary;
  if (loaded.some(({ operation }) =>
    operation.summary.accountId !== first.accountId ||
    operation.summary.accountType !== first.accountType ||
    operation.summary.accountAddress.toLowerCase() !== first.accountAddress.toLowerCase() ||
    operation.summary.chainId !== first.chainId ||
    operation.summary.poolAddress.toLowerCase() !== first.poolAddress.toLowerCase()
  )) throw new Error("operation-unavailable");
  return loaded;
}

function exactPendingBatch(
  pending: PendingBatchTxRequest,
  loaded: Awaited<ReturnType<typeof loadBatchOperations>>,
): boolean {
  const first = loaded[0].operation.summary;
  return pending.id === first.batchId &&
    pending.trustedInternal === true &&
    pending.privacyRagequitMeta?.version === 1 &&
    pending.privacyRagequitMeta.operationIds.length === loaded.length &&
    pending.privacyRagequitMeta.operationIds.every(
      (id, index) => id === loaded[index].operation.summary.id,
    ) &&
    pending.accountId === first.accountId &&
    pending.accountType === first.accountType &&
    pending.accountAddress?.toLowerCase() === first.accountAddress.toLowerCase() &&
    pending.chainId === first.chainId &&
    pending.params.atomicRequired === true &&
    pending.params.from?.toLowerCase() === first.accountAddress.toLowerCase() &&
    pending.params.calls.length === loaded.length &&
    pending.params.calls.every((call, index) =>
      call.to?.toLowerCase() === first.poolAddress.toLowerCase() &&
      BigInt(call.value ?? "0x0") === 0n &&
      call.data?.toLowerCase() === loaded[index].details.callData.toLowerCase()
    );
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

/** Queue one immutable ERC-5792 review for a same-account atomic public exit. */
export async function queuePrivacyRagequitBatchConfirmation(
  batchId: string,
  operationIds: readonly string[],
) {
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment().catch(() => {
    throw new Error("operation-unavailable");
  });
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    assertPrivacyMasterAuthorization(expectedEpoch);
    const loaded = await loadBatchOperations(batchId, operationIds);
    const first = loaded[0].operation.summary;
    const account = await getAccountById(first.accountId);
    if (
      !account || account.type === "impersonator" ||
      account.type !== first.accountType ||
      !isPrivacyPoolsMutationAccountType(account.type) ||
      account.address.toLowerCase() !== first.accountAddress.toLowerCase()
    ) throw new Error("operation-unavailable");

    if (account.type === "privateKey" || account.type === "seedPhrase") {
      const chain = await getStoredResolvedChainById(first.chainId);
      const resolution = await resolveActiveDelegate({
        accountId: account.id,
        accountAddress: account.address as `0x${string}`,
        chainId: first.chainId,
        rpcUrl: chain?.rpcUrl ?? "",
      });
      if (!resolution.delegate) throw new Error("operation-unavailable");
    }

    const existing = await getPendingBatchTxRequestById(batchId);
    if (existing) {
      if (!exactPendingBatch(existing, loaded)) throw new Error("operation-unavailable");
      return loaded.map(({ operation }) => privacyRagequitPublicSummary(operation));
    }
    const pending = pinnedBatchTxRequest(account, {
      id: batchId,
      params: {
        version: "2.0.0",
        chainId: toHex(first.chainId),
        from: first.accountAddress,
        atomicRequired: true,
        calls: loaded.map(({ details }) => ({
          to: first.poolAddress,
          data: details.callData,
          value: toHex(0n),
        })),
      },
      origin: "WalletChan Public Exit",
      favicon: null,
      chainName: PRIVACY_POOLS_DEPLOYMENT.chainName,
      chainId: first.chainId,
      timestamp: Date.now(),
      trustedInternal: true,
      privacyRagequitMeta: { version: 1, operationIds: [...operationIds] },
    });
    assertPrivacyMasterAuthorization(expectedEpoch);
    await savePendingBatchTxRequest(pending);
    try {
      await saveBundleStatus({
        id: batchId,
        chainId: first.chainId,
        status: BUNDLE_STATUS.PENDING,
        atomic: true,
        createdAt: Date.now(),
      });
    } catch (error) {
      const { removePendingBatchTxRequest } = await import(
        "../../requests/pendingBatchTxStorage"
      );
      await removePendingBatchTxRequest(batchId).catch(() => undefined);
      throw error;
    }
    void chrome.runtime.sendMessage({
      type: "newPendingBatchTxRequest",
      batchRequest: pending,
    }).catch(() => undefined);
    return loaded.map(({ operation }) => privacyRagequitPublicSummary(operation));
  });
}

export async function authorizePrivacyRagequitBatchConfirmation(
  pending: PendingBatchTxRequest,
): Promise<PrivacyRagequitBatchAuthorization | null> {
  if (!pending.privacyRagequitMeta) return null;
  const expectedAuthEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new Error("auth-required");
  });
  await verifyPrivacyPoolsDeployment();
  const operationIds = pending.privacyRagequitMeta.operationIds;
  const loaded = await loadBatchOperations(pending.id, operationIds);
  if (!exactPendingBatch(pending, loaded)) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(expectedAuthEpoch);
  return { batchId: pending.id, operationIds: [...operationIds], expectedAuthEpoch };
}

export async function revalidatePrivacyRagequitBatchConfirmation(
  pending: PendingBatchTxRequest,
  authorization: PrivacyRagequitBatchAuthorization,
): Promise<void> {
  if (
    pending.id !== authorization.batchId ||
    pending.privacyRagequitMeta?.version !== 1 ||
    pending.privacyRagequitMeta.operationIds.length !== authorization.operationIds.length ||
    pending.privacyRagequitMeta.operationIds.some(
      (id, index) => id !== authorization.operationIds[index],
    )
  ) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
  const loaded = await loadBatchOperations(pending.id, authorization.operationIds);
  if (!exactPendingBatch(pending, loaded)) throw new Error("operation-unavailable");
  assertPrivacyMasterAuthorization(authorization.expectedAuthEpoch);
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
