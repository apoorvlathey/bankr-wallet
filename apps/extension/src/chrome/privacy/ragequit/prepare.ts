import { encodeFunctionData, type Address } from "viem";

import { getAccountById, getAccounts } from "../../accounts/repository";
import type { AccountType } from "../../types";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import {
  canonicalPrivacyCommitments,
  repairPrivacyCommitmentLineages,
} from "../commitments/lineageIntegrity";
import { assertPrivacyCommitmentSpendable } from "../commitments/spendability";
import {
  isPrivacyCommitmentPubliclyRecoverableStatus,
  type PrivacyCommitmentStatus,
} from "../commitments/types";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import { isPrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";
import { derivePrivacyPoolCommitment } from "../protocol/primitives";
import { listAllPrivacyShieldOperations } from "../operations/repository";
import {
  getPrivacyProverDiagnosticCode,
  provePrivacyCommitment,
} from "../prover/coordinator";
import type { PrivacyGroth16Proof } from "../prover/messages";
import { derivePrivacyCurrentCommitmentSecrets } from "../withdrawals/lineage";
import {
  decryptPrivacyRagequitDetails,
  encryptPrivacyRagequitDetails,
} from "./crypto";
import {
  commitPrivacyRagequit,
  deletePrivacyRagequit,
  getPrivacyRagequitByRequestId,
  listAllPrivacyRagequits,
} from "./repository";
import {
  defaultPrivacyRagequitTracking,
  type PrivacyRagequitDetailsV1,
  type PrivacyRagequitSummaryV1,
  type StoredPrivacyRagequitV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

function logRecoveryProof(
  stage: "started" | "succeeded" | "failed" | "signal-binding-failed",
  code?: string,
): void {
  const line = JSON.stringify(code === undefined ? { stage } : { stage, code });
  if (stage === "failed" || stage === "signal-binding-failed") {
    console.warn("[privacy-shield] public-recovery-proof", line);
  } else {
    console.info("[privacy-shield] public-recovery-proof", line);
  }
}

export const PRIVACY_RAGEQUIT_ABI = [{
  type: "function",
  name: "ragequit",
  stateMutability: "nonpayable",
  inputs: [{
    name: "_proof",
    type: "tuple",
    components: [
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
      { name: "pubSignals", type: "uint256[4]" },
    ],
  }],
  outputs: [],
}] as const;

export type PrivacyRagequitPrepareErrorCode =
  | "invalid-request"
  | "auth-required"
  | "account-unavailable"
  | "bankr-testnet-unsupported"
  | "recovery-unavailable"
  | "balance-syncing"
  | "proof-failed";

export class PrivacyRagequitPrepareError extends Error {
  constructor(readonly code: PrivacyRagequitPrepareErrorCode) {
    super(code);
    this.name = "PrivacyRagequitPrepareError";
  }
}

export interface PrivacyRagequitAccountRequest {
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
  commitmentId: string;
  sourceOperationId: string | null;
}

export interface PrivacyRagequitSelection extends PrivacyRagequitAccountRequest {
  expectedAmountWei: string;
}

export interface PreparedPrivacyRagequitBatch {
  batchId: string;
  operations: StoredPrivacyRagequitV1[];
}

export const MAX_PRIVACY_RAGEQUIT_BATCH_SIZE = 8;

export interface PrivacyRagequitPreview {
  commitmentId: string;
  createdAt: number;
  accountId: string;
  accountAddress: string;
  accountType: PrivacyRagequitAccountRequest["accountType"];
  amountWei: string;
  originalAmountWei: string;
  withdrawnAmountWei: string;
  withdrawalCount: number;
  sourceOperationId: string | null;
}

type PrivacyRagequittableCommitmentStatus = Extract<
  PrivacyCommitmentStatus,
  "awaiting_asp" | "asp_unavailable" | "private_ready" | "asp_declined" | "asp_removed"
>;

function isPrivacyCommitmentRagequittableStatus(
  status: PrivacyCommitmentStatus,
): status is PrivacyRagequittableCommitmentStatus {
  return status === "private_ready" ||
    isPrivacyCommitmentPubliclyRecoverableStatus(status);
}

export function selectPrivacyRagequitCommitment<T extends {
  record: { createdAt: number };
  details: {
    status: Parameters<typeof isPrivacyCommitmentPubliclyRecoverableStatus>[0];
    depositor: string;
    sourceOperationId: string | null;
  };
}>(
  commitments: readonly T[],
  accountAddress: string,
  sourceOperationId: string | null,
  commitmentId: string | null = null,
): T | null {
  return commitments
    .filter((item) =>
      isPrivacyCommitmentRagequittableStatus(item.details.status) &&
      item.details.depositor.toLowerCase() === accountAddress.toLowerCase() &&
      (commitmentId === null ||
        ("id" in item.record && item.record.id === commitmentId)) &&
      (sourceOperationId === null ||
        item.details.sourceOperationId === sourceOperationId)
    )
    .sort((left, right) => left.record.createdAt - right.record.createdAt)[0] ?? null;
}

interface RagequitPreviewCommitment {
  record: { id: string; createdAt: number };
  details: {
    status: PrivacyCommitmentStatus;
    depositor: string;
    balanceWei: string;
    valueWei: string;
    withdrawalIndex: string;
    sourceOperationId: string | null;
  };
}

interface RagequitPreviewAccount {
  id: string;
  address: string;
  type: AccountType;
}

interface RagequitPreviewOperation {
  summary: {
    id: string;
    accountId: string;
    accountAddress: string;
    accountType: AccountType;
  };
}

/** Pure all-current-commitments projection used by the trusted preview route. */
export function projectPrivacyRagequitPreviews(input: {
  commitments: readonly RagequitPreviewCommitment[];
  accounts: readonly RagequitPreviewAccount[];
  operations: readonly RagequitPreviewOperation[];
  preferredOperationId: string | null;
}): PrivacyRagequitPreview[] {
  const eligibleAccounts = input.accounts.filter((account) =>
    isPrivacyPoolsMutationAccountType(account.type)
  );
  const accountsById = new Map(eligibleAccounts.map((account) => [account.id, account]));
  const operationsById = new Map(input.operations.map((operation) => [
    operation.summary.id,
    operation,
  ]));
  return input.commitments
    .filter((item) =>
      isPrivacyCommitmentRagequittableStatus(item.details.status) &&
      (input.preferredOperationId === null ||
        item.details.sourceOperationId === input.preferredOperationId)
    )
    .sort((left, right) => right.record.createdAt - left.record.createdAt)
    .flatMap((item): PrivacyRagequitPreview[] => {
      const sourceOperation = item.details.sourceOperationId === null
        ? null
        : operationsById.get(item.details.sourceOperationId) ?? null;
      const account = sourceOperation
        ? accountsById.get(sourceOperation.summary.accountId) ?? null
        : eligibleAccounts.find((candidate) =>
            candidate.address.toLowerCase() === item.details.depositor.toLowerCase()
          ) ?? null;
      if (
        !account ||
        !isPrivacyPoolsMutationAccountType(account.type) ||
        account.address.toLowerCase() !== item.details.depositor.toLowerCase() ||
        (sourceOperation &&
          (sourceOperation.summary.accountAddress.toLowerCase() !==
            item.details.depositor.toLowerCase() ||
            sourceOperation.summary.accountType !== account.type))
      ) return [];
      return [{
        commitmentId: item.record.id,
        createdAt: item.record.createdAt,
        accountId: account.id,
        accountAddress: account.address,
        accountType: account.type,
        amountWei: item.details.balanceWei,
        originalAmountWei: item.details.valueWei,
        withdrawnAmountWei:
          (BigInt(item.details.valueWei) - BigInt(item.details.balanceWei)).toString(),
        withdrawalCount: Number(BigInt(item.details.withdrawalIndex)),
        sourceOperationId: item.details.sourceOperationId,
      }];
    });
}

function validateRagequitAccountRequest(
  request: PrivacyRagequitAccountRequest,
): void {
  if (
    !UUID.test(request.commitmentId) ||
    (request.sourceOperationId !== null && !UUID.test(request.sourceOperationId)) ||
    !/^0x[0-9a-fA-F]{40}$/.test(request.accountAddress)
  ) throw new PrivacyRagequitPrepareError("invalid-request");
}

async function resolveRagequitAccount(
  request: PrivacyRagequitAccountRequest,
) {
  const account = await getAccountById(request.accountId);
  if (
    !account ||
    account.address.toLowerCase() !== request.accountAddress.toLowerCase() ||
    account.type !== request.accountType
  ) throw new PrivacyRagequitPrepareError("account-unavailable");
  if (!isPrivacyPoolsMutationAccountType(account.type)) {
    throw new PrivacyRagequitPrepareError("bankr-testnet-unsupported");
  }
  return account;
}

/** List every exact whole-commitment public exit without proving or persisting it. */
export async function previewPrivacyRagequits(
  preferredOperationId: string | null,
): Promise<PrivacyRagequitPreview[]> {
  if (preferredOperationId !== null && !UUID.test(preferredOperationId)) {
    throw new PrivacyRagequitPrepareError("invalid-request");
  }
  await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyRagequitPrepareError("auth-required");
  });
  const material = await readPrivacyAspMasterMaterial();
  if (!material) throw new PrivacyRagequitPrepareError("auth-required");
  await repairPrivacyCommitmentLineages(material);
  const [commitments, accounts, operations] = await Promise.all([
    readPrivacyCommitments(material.key, material.keyId),
    getAccounts(),
    listAllPrivacyShieldOperations(),
  ]);
  const previews = projectPrivacyRagequitPreviews({
    commitments: canonicalPrivacyCommitments(commitments),
    accounts,
    operations,
    preferredOperationId,
  });
  return previews;
}

function proofTuple(proof: PrivacyGroth16Proof) {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as const,
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as const,
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as const,
  };
}

export function encodePrivacyRagequitCallData(input: {
  proof: PrivacyGroth16Proof;
  publicSignals: readonly string[];
  expected: readonly [string, string, string, string];
}) {
  if (
    input.publicSignals.length !== 4 ||
    input.publicSignals.some((signal, index) => BigInt(signal) !== BigInt(input.expected[index]))
  ) throw new Error("Public recovery proof signals do not match");
  return encodeFunctionData({
    abi: PRIVACY_RAGEQUIT_ABI,
    functionName: "ragequit",
    args: [{
      ...proofTuple(input.proof),
      pubSignals: input.publicSignals.map(BigInt) as [bigint, bigint, bigint, bigint],
    }],
  });
}

/** Build and persist a proof-backed public recovery before any transaction is queued. */
export async function preparePrivacyRagequit(
  requestId: string,
  requestedAccount: PrivacyRagequitAccountRequest & { expectedAmountWei: string },
  batchId?: string,
): Promise<StoredPrivacyRagequitV1> {
  if (
    !UUID.test(requestId) ||
    (batchId !== undefined && !UUID.test(batchId)) ||
    !UINT.test(requestedAccount.expectedAmountWei) ||
    BigInt(requestedAccount.expectedAmountWei) <= 0n
  ) throw new PrivacyRagequitPrepareError("invalid-request");
  validateRagequitAccountRequest(requestedAccount);
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyRagequitPrepareError("auth-required");
  });
  const account = await resolveRagequitAccount(requestedAccount);
  const [byRequest, existing, material] = await Promise.all([
    getPrivacyRagequitByRequestId(requestId),
    listAllPrivacyRagequits(),
    readPrivacyAspMasterMaterial(),
  ]);
  let commitments: Awaited<ReturnType<typeof readPrivacyCommitments>> | null = null;
  const bindsRequestedCommitment = async (operation: StoredPrivacyRagequitV1) => {
    if (!material) return false;
    commitments ??= canonicalPrivacyCommitments(
      await readPrivacyCommitments(material.key, material.keyId),
    );
    const details = await decryptPrivacyRagequitDetails(material.key, operation);
    return Boolean(
      details &&
      details.commitmentId === requestedAccount.commitmentId &&
      commitments.some((item) =>
        item.record.id === requestedAccount.commitmentId &&
        (requestedAccount.sourceOperationId === null ||
          item.details.sourceOperationId === requestedAccount.sourceOperationId)
      ),
    );
  };
  if (byRequest) {
    if (
      byRequest.summary.accountId !== account.id ||
      byRequest.summary.accountAddress.toLowerCase() !== account.address.toLowerCase() ||
      byRequest.summary.amountWei !== requestedAccount.expectedAmountWei ||
      byRequest.summary.batchId !== batchId
    ) throw new PrivacyRagequitPrepareError("invalid-request");
    if (!(await bindsRequestedCommitment(byRequest))) {
      throw new PrivacyRagequitPrepareError("invalid-request");
    }
    return byRequest;
  }
  const reusableCandidates = existing.filter((operation) =>
    operation.tracking.state === "awaiting_wallet_confirmation" &&
    operation.summary.accountId === account.id &&
    operation.summary.accountAddress.toLowerCase() === account.address.toLowerCase() &&
    operation.summary.amountWei === requestedAccount.expectedAmountWei &&
    operation.summary.batchId === batchId
  );
  for (const reusable of reusableCandidates) {
    if (await bindsRequestedCommitment(reusable)) return reusable;
  }
  if (!material) throw new PrivacyRagequitPrepareError("auth-required");
  await verifyPrivacyPoolsDeployment().catch(() => {
    throw new PrivacyRagequitPrepareError("recovery-unavailable");
  });
  await repairPrivacyCommitmentLineages(material);
  commitments ??= canonicalPrivacyCommitments(
    await readPrivacyCommitments(material.key, material.keyId),
  );
  const selected = selectPrivacyRagequitCommitment(
    commitments,
    account.address,
    requestedAccount.sourceOperationId,
    requestedAccount.commitmentId,
  );
  if (!selected) throw new PrivacyRagequitPrepareError("recovery-unavailable");
  const previousStatus = selected.details.status;
  if (!isPrivacyCommitmentRagequittableStatus(previousStatus)) {
    throw new PrivacyRagequitPrepareError("recovery-unavailable");
  }
  if (selected.details.balanceWei !== requestedAccount.expectedAmountWei) {
    throw new PrivacyRagequitPrepareError("recovery-unavailable");
  }

  const secrets = derivePrivacyCurrentCommitmentSecrets({
    commitment: selected.details,
    masterKeys: material.masterKeys,
  });
  const commitment = derivePrivacyPoolCommitment(
    BigInt(selected.details.balanceWei),
    BigInt(selected.details.label),
    secrets,
  );
  if (commitment.hash !== BigInt(selected.details.commitment)) {
    throw new PrivacyRagequitPrepareError("recovery-unavailable");
  }
  await assertPrivacyCommitmentSpendable({
    commitment: selected.details,
    masterKeys: material.masterKeys,
  }).catch(() => {
    throw new PrivacyRagequitPrepareError("balance-syncing");
  });
  logRecoveryProof("started");
  const result = await provePrivacyCommitment({
    value: selected.details.balanceWei,
    label: selected.details.label,
    nullifier: secrets.nullifier.toString(),
    secret: secrets.secret.toString(),
  }).catch((error: unknown) => {
    logRecoveryProof("failed", getPrivacyProverDiagnosticCode(error));
    throw new PrivacyRagequitPrepareError("proof-failed");
  });
  logRecoveryProof("succeeded");
  const expectedSignals = [
    commitment.hash.toString(),
    commitment.nullifierHash.toString(),
    selected.details.balanceWei,
    selected.details.label,
  ] as const;
  let callData: `0x${string}`;
  try {
    callData = encodePrivacyRagequitCallData({
      proof: result.proof,
      publicSignals: result.publicSignals,
      expected: expectedSignals,
    });
  } catch {
    logRecoveryProof("signal-binding-failed", "invalid-result");
    throw new PrivacyRagequitPrepareError("proof-failed");
  }
  const operationId = crypto.randomUUID();
  const createdAt = Date.now();
  const summary: PrivacyRagequitSummaryV1 = {
    schema: "walletchan-privacy-ragequit-v1",
    version: 1,
    id: operationId,
    requestId,
    ...(batchId ? { batchId } : {}),
    createdAt,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    accountId: account.id,
    accountAddress: account.address as Address,
    accountType: account.type,
    amountWei: selected.details.balanceWei,
    poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
  };
  const details: PrivacyRagequitDetailsV1 = {
    version: 1,
    operationId,
    commitmentId: selected.record.id,
    commitmentRevision: selected.record.revision,
    commitmentHash: selected.details.commitment,
    label: selected.details.label,
    balanceWei: selected.details.balanceWei,
    nullifierHash: commitment.nullifierHash.toString(),
    previousStatus,
    callData,
  };
  const record: StoredPrivacyRagequitV1 = {
    summary,
    keyId: material.keyId,
    encryptedDetails: await encryptPrivacyRagequitDetails(
      material.key,
      material.keyId,
      summary,
      details,
    ),
    tracking: defaultPrivacyRagequitTracking(summary),
  };

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try { assertPrivacyMasterAuthorization(expectedEpoch); } catch {
      throw new PrivacyRagequitPrepareError("auth-required");
    }
    const latest = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === selected.record.id);
    if (
      !latest || latest.record.revision !== selected.record.revision ||
      latest.details.status !== selected.details.status ||
      latest.details.commitment !== selected.details.commitment ||
      latest.details.balanceWei !== selected.details.balanceWei
    ) throw new PrivacyRagequitPrepareError("recovery-unavailable");
    await assertPrivacyCommitmentSpendable({
      commitment: latest.details,
      masterKeys: material.masterKeys,
    }).catch(() => {
      throw new PrivacyRagequitPrepareError("balance-syncing");
    });
    const committed = await commitPrivacyRagequit(record);
    if (committed.status === "existing") return committed.record;
    try {
      assertPrivacyMasterAuthorization(expectedEpoch);
      const claimed = await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        selected.record.id,
        "ragequit_pending",
        {
          revision: selected.record.revision,
          status: selected.details.status,
        },
      );
      if (!claimed) {
        throw new PrivacyRagequitPrepareError("balance-syncing");
      }
      return record;
    } catch (error) {
      await deletePrivacyRagequit(record.summary.id).catch(() => undefined);
      throw error;
    }
  });
}

export function validatePrivacyRagequitBatchSelections(
  batchId: string,
  selections: readonly PrivacyRagequitSelection[],
): void {
  if (
    !UUID.test(batchId) ||
    selections.length < 2 ||
    selections.length > MAX_PRIVACY_RAGEQUIT_BATCH_SIZE
  ) throw new PrivacyRagequitPrepareError("invalid-request");
  const [first] = selections;
  const commitmentIds = new Set<string>();
  for (const selection of selections) {
    validateRagequitAccountRequest(selection);
    if (
      selection.accountId !== first.accountId ||
      selection.accountAddress.toLowerCase() !== first.accountAddress.toLowerCase() ||
      selection.accountType !== first.accountType ||
      !UINT.test(selection.expectedAmountWei) ||
      BigInt(selection.expectedAmountWei) <= 0n ||
      commitmentIds.has(selection.commitmentId)
    ) throw new PrivacyRagequitPrepareError("invalid-request");
    commitmentIds.add(selection.commitmentId);
  }
}

export async function rollbackPreparedPrivacyRagequitBatch(
  operations: readonly StoredPrivacyRagequitV1[],
): Promise<void> {
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const material = await readPrivacyAspMasterMaterial();
    const releasable = new Set<string>();
    if (material) {
      for (const operation of [...operations].reverse()) {
        if (operation.keyId !== material.keyId) continue;
        const details = await decryptPrivacyRagequitDetails(material.key, operation);
        if (!details) continue;
        const commitment = (await readPrivacyCommitments(material.key, material.keyId))
          .find((item) => item.record.id === details.commitmentId);
        if (
          commitment?.record.revision === details.commitmentRevision + 1 &&
          commitment.details.status === "ragequit_pending" &&
          commitment.details.commitment === details.commitmentHash &&
          commitment.details.balanceWei === details.balanceWei
        ) {
          try {
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
            releasable.add(operation.summary.id);
          } catch {
            // Retain the encrypted operation so claim repair remains possible.
          }
        }
      }
    }
    await Promise.all(
      operations.filter((operation) => releasable.has(operation.summary.id)).map((operation) =>
        deletePrivacyRagequit(operation.summary.id).catch(() => undefined)
      ),
    );
  });
}

/** Prepare every selected whole commitment for one same-account atomic exit. */
export async function preparePrivacyRagequitBatch(
  batchId: string,
  selections: readonly PrivacyRagequitSelection[],
): Promise<PreparedPrivacyRagequitBatch> {
  validatePrivacyRagequitBatchSelections(batchId, selections);
  const operations: StoredPrivacyRagequitV1[] = [];
  try {
    for (let index = 0; index < selections.length; index += 1) {
      operations.push(await preparePrivacyRagequit(
        index === 0 ? batchId : crypto.randomUUID(),
        selections[index],
        batchId,
      ));
    }
    if (
      operations.length !== selections.length ||
      operations.some((operation) => operation.summary.batchId !== batchId)
    ) throw new PrivacyRagequitPrepareError("recovery-unavailable");
    return { batchId, operations };
  } catch (error) {
    await rollbackPreparedPrivacyRagequitBatch(operations);
    throw error;
  }
}
