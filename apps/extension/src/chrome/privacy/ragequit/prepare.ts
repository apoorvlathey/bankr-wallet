import { encodeFunctionData, type Address } from "viem";

import { getAccountById } from "../../accounts/repository";
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
import { isPrivacyCommitmentPubliclyRecoverableStatus } from "../commitments/types";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import { verifyPrivacyPoolsSepoliaDeployment } from "../deployment/health";
import { derivePrivacyPoolCommitment } from "../protocol/primitives";
import {
  getPrivacyProverDiagnosticCode,
  provePrivacyCommitment,
} from "../prover/coordinator";
import type { PrivacyGroth16Proof } from "../prover/messages";
import { derivePrivacyCurrentCommitmentSecrets } from "../withdrawals/lineage";
import { encryptPrivacyRagequitDetails } from "./crypto";
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
  | "proof-failed";

export class PrivacyRagequitPrepareError extends Error {
  constructor(readonly code: PrivacyRagequitPrepareErrorCode) {
    super(code);
    this.name = "PrivacyRagequitPrepareError";
  }
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
  requestedAccount: {
    accountId: string;
    accountAddress: string;
    accountType: "privateKey" | "seedPhrase";
  },
): Promise<StoredPrivacyRagequitV1> {
  if (!UUID.test(requestId)) throw new PrivacyRagequitPrepareError("invalid-request");
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyRagequitPrepareError("auth-required");
  });
  const account = await getAccountById(requestedAccount.accountId);
  if (!account ||
    account.address.toLowerCase() !== requestedAccount.accountAddress.toLowerCase() ||
    account.type !== requestedAccount.accountType) {
    throw new PrivacyRagequitPrepareError("account-unavailable");
  }
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    throw new PrivacyRagequitPrepareError("bankr-testnet-unsupported");
  }
  const [byRequest, existing, material] = await Promise.all([
    getPrivacyRagequitByRequestId(requestId),
    listAllPrivacyRagequits(),
    readPrivacyAspMasterMaterial(),
  ]);
  if (byRequest) {
    if (
      byRequest.summary.accountId !== account.id ||
      byRequest.summary.accountAddress.toLowerCase() !== account.address.toLowerCase()
    ) throw new PrivacyRagequitPrepareError("invalid-request");
    return byRequest;
  }
  const reusable = existing.find((operation) =>
    operation.tracking.state === "awaiting_wallet_confirmation" &&
    operation.summary.accountId === account.id &&
    operation.summary.accountAddress.toLowerCase() === account.address.toLowerCase()
  );
  if (reusable) return reusable;
  if (!material) throw new PrivacyRagequitPrepareError("auth-required");
  await verifyPrivacyPoolsSepoliaDeployment().catch(() => {
    throw new PrivacyRagequitPrepareError("recovery-unavailable");
  });
  const commitments = await readPrivacyCommitments(material.key, material.keyId);
  const selected = commitments
    .filter((item) =>
      isPrivacyCommitmentPubliclyRecoverableStatus(item.details.status) &&
      item.details.depositor.toLowerCase() === account.address.toLowerCase()
    )
    .sort((left, right) => left.record.createdAt - right.record.createdAt)[0];
  if (!selected) throw new PrivacyRagequitPrepareError("recovery-unavailable");
  const previousStatus = selected.details.status;
  if (!isPrivacyCommitmentPubliclyRecoverableStatus(previousStatus)) {
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
    createdAt,
    chainId: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId,
    accountId: account.id,
    accountAddress: account.address as Address,
    accountType: account.type,
    amountWei: selected.details.balanceWei,
    poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
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
    const committed = await commitPrivacyRagequit(record);
    if (committed.status === "existing") return committed.record;
    try {
      assertPrivacyMasterAuthorization(expectedEpoch);
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        selected.record.id,
        "ragequit_pending",
      );
      return record;
    } catch (error) {
      await deletePrivacyRagequit(record.summary.id).catch(() => undefined);
      throw error;
    }
  });
}
