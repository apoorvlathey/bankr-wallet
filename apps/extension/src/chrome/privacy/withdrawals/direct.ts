import {
  calculateContext,
  generateMerkleProof,
} from "@0xbow/privacy-pools-core-sdk";
import {
  createPublicClient,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";

import { getAccountById } from "../../accounts/repository";
import { estimateFees } from "../../gas/feeEstimator";
import { DEFAULT_GAS_BUFFER_PCT } from "../../gas/singlePolicy";
import { secureHttpTransport } from "../../network/rpcClient";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import {
  assertPrivacyMasterAuthorization,
  capturePrivacyMasterAuthorization,
} from "../authorization";
import { fetchPrivacyAspLeaves, fetchPrivacyAspRoots } from "../asp/client";
import { readPrivacyAspMasterMaterial } from "../asp/eligibility";
import { readPrivacyAspOnchainRoots } from "../asp/onchain";
import {
  readPrivacyCommitments,
  updatePrivacyCommitmentStatus,
} from "../commitments/repository";
import {
  canonicalPrivacyCommitments,
  repairPrivacyCommitmentLineages,
} from "../commitments/lineageIntegrity";
import { assertPrivacyCommitmentSpendable } from "../commitments/spendability";
import { PRIVACY_POOLS_VIEM_CHAIN } from "../deployment/chain";
import {
  resolvePrivacyPoolsRpcUrl,
  verifyPrivacyPoolsDeployment,
} from "../deployment/health";
import { isPrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { provePrivacyWithdrawal } from "../prover/coordinator";
import type { PrivacyGroth16Proof } from "../prover/messages";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";
import { encryptPrivacyUnshieldDetails } from "./crypto";
import { derivePrivacyWithdrawalLineage } from "./lineage";
import {
  commitPrivacyUnshield,
  deletePrivacyUnshield,
} from "./repository";
import {
  defaultPrivacyUnshieldTracking,
  type PrivacyDirectUnshieldDetailsV1,
  type PrivacyDirectUnshieldSummaryV1,
  type StoredPrivacyUnshieldV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const DIRECT_PROOF_TTL_MS = 5 * 60_000;

export const PRIVACY_DIRECT_WITHDRAW_ABI = [{
  type: "function",
  name: "withdraw",
  stateMutability: "nonpayable",
  inputs: [
    {
      name: "_withdrawal",
      type: "tuple",
      components: [
        { name: "processooor", type: "address" },
        { name: "data", type: "bytes" },
      ],
    },
    {
      name: "_proof",
      type: "tuple",
      components: [
        { name: "pA", type: "uint256[2]" },
        { name: "pB", type: "uint256[2][2]" },
        { name: "pC", type: "uint256[2]" },
        { name: "pubSignals", type: "uint256[8]" },
      ],
    },
  ],
  outputs: [],
}] as const;

export type PrivacyDirectUnshieldErrorCode =
  | "invalid-request"
  | "auth-required"
  | "account-unavailable"
  | "bankr-testnet-unsupported"
  | "balance-unavailable"
  | "balance-syncing"
  | "insufficient-gas"
  | "proof-failed"
  | "operation-unavailable";

export class PrivacyDirectUnshieldError extends Error {
  constructor(readonly code: PrivacyDirectUnshieldErrorCode) {
    super(code);
    this.name = "PrivacyDirectUnshieldError";
  }
}

function pad32(values: readonly bigint[]): string[] {
  if (values.length > 32) throw new Error("Privacy Pools Merkle proof is too deep");
  return [...values, ...Array<bigint>(32 - values.length).fill(0n)]
    .map((value) => value.toString());
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

function encodeDirectWithdrawalCall(input: {
  accountAddress: Address;
  proof: PrivacyGroth16Proof;
  publicSignals: readonly string[];
  expectedSignals: readonly string[];
}): Hex {
  if (
    input.publicSignals.length !== 8 ||
    input.expectedSignals.length !== 8 ||
    input.publicSignals.some((signal, index) =>
      BigInt(signal) !== BigInt(input.expectedSignals[index])
    )
  ) throw new Error("Direct withdrawal proof signals do not match");
  return encodeFunctionData({
    abi: PRIVACY_DIRECT_WITHDRAW_ABI,
    functionName: "withdraw",
    args: [
      { processooor: input.accountAddress, data: "0x" },
      {
        ...proofTuple(input.proof),
        pubSignals: input.publicSignals.map(BigInt) as [
          bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
        ],
      },
    ],
  });
}

export async function resolveDirectAccount(input: {
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
}) {
  const account = await getAccountById(input.accountId);
  if (
    !account || account.type !== input.accountType ||
    account.address.toLowerCase() !== input.accountAddress.toLowerCase()
  ) throw new PrivacyDirectUnshieldError("account-unavailable");
  if (!isPrivacyPoolsMutationAccountType(account.type)) {
    throw new PrivacyDirectUnshieldError("bankr-testnet-unsupported");
  }
  return account;
}

async function estimateDirectGas(account: Address, callData: Hex) {
  const rpcUrl = await resolvePrivacyPoolsRpcUrl();
  const client = createPublicClient({
    chain: PRIVACY_POOLS_VIEM_CHAIN,
    transport: secureHttpTransport(rpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  const [balanceWei, estimatedGas, fees] = await Promise.all([
    client.getBalance({ address: account }),
    client.estimateGas({
      account,
      to: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
      data: callData,
      value: 0n,
    }),
    estimateFees(client, PRIVACY_POOLS_DEPLOYMENT.chainId),
  ]);
  if (!fees || estimatedGas <= 0n || fees.maxFeePerGas <= 0n) {
    throw new PrivacyDirectUnshieldError("operation-unavailable");
  }
  const gasLimit = estimatedGas * BigInt(100 + DEFAULT_GAS_BUFFER_PCT) / 100n;
  const gasFeeEstimateWei = gasLimit * fees.maxFeePerGas;
  if (balanceWei < gasFeeEstimateWei) {
    throw new PrivacyDirectUnshieldError("insufficient-gas");
  }
  return { gasLimit, maxFeePerGas: fees.maxFeePerGas, gasFeeEstimateWei };
}

/** Prove, persist, and claim an exact receiver-paid withdrawal. */
export async function preparePrivacyDirectUnshield(input: {
  requestId: string;
  amountWei: string;
  recipient: string;
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
}): Promise<StoredPrivacyUnshieldV1> {
  if (
    !UUID.test(input.requestId) || !UINT.test(input.amountWei) ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.recipient) ||
    input.recipient.toLowerCase() !== input.accountAddress.toLowerCase()
  ) throw new PrivacyDirectUnshieldError("invalid-request");
  const amountWei = BigInt(input.amountWei);
  if (amountWei <= 0n) throw new PrivacyDirectUnshieldError("invalid-request");
  const expectedEpoch = await capturePrivacyMasterAuthorization().catch(() => {
    throw new PrivacyDirectUnshieldError("auth-required");
  });
  const account = await resolveDirectAccount(input);
  await verifyPrivacyPoolsDeployment().catch(() => {
    throw new PrivacyDirectUnshieldError("operation-unavailable");
  });
  const material = await readPrivacyAspMasterMaterial();
  if (!material) throw new PrivacyDirectUnshieldError("auth-required");
  await repairPrivacyCommitmentLineages(material);
  const commitments = await readPrivacyCommitments(material.key, material.keyId);
  const selected = canonicalPrivacyCommitments(commitments)
    .filter((item) => item.details.status === "private_ready" && BigInt(item.details.balanceWei) >= amountWei)
    .sort((left, right) => BigInt(left.details.balanceWei) < BigInt(right.details.balanceWei) ? -1 : 1)[0];
  if (!selected) throw new PrivacyDirectUnshieldError("balance-unavailable");
  await assertPrivacyCommitmentSpendable({
    commitment: selected.details,
    masterKeys: material.masterKeys,
  }).catch(() => {
    throw new PrivacyDirectUnshieldError("balance-syncing");
  });
  const lineage = derivePrivacyWithdrawalLineage({
    commitment: selected.details,
    masterKeys: material.masterKeys,
    amountWei,
  });

  const [roots, leaves] = await Promise.all([
    fetchPrivacyAspRoots(),
    fetchPrivacyAspLeaves(),
  ]).catch(() => {
    throw new PrivacyDirectUnshieldError("operation-unavailable");
  });
  const onchain = await readPrivacyAspOnchainRoots({
    expectedStateRoot: BigInt(roots.onchainMtRoot),
  });
  if (
    BigInt(roots.mtRoot) !== onchain.associationRoot ||
    BigInt(roots.onchainMtRoot) !== onchain.verifiedStateRoot
  ) throw new PrivacyDirectUnshieldError("operation-unavailable");
  const aspProof = generateMerkleProof(leaves.aspLeaves.map(BigInt), BigInt(selected.details.label));
  const stateProof = generateMerkleProof(leaves.stateTreeLeaves.map(BigInt), BigInt(selected.details.commitment));
  if (aspProof.root !== onchain.associationRoot || stateProof.root !== onchain.verifiedStateRoot) {
    throw new PrivacyDirectUnshieldError("operation-unavailable");
  }
  const accountAddress = account.address as Address;
  const withdrawalContext = {
    processooor: accountAddress,
    data: "0x",
  } as Parameters<typeof calculateContext>[0];
  const context = BigInt(calculateContext(
    withdrawalContext,
    PRIVACY_POOLS_DEPLOYMENT.scope as never,
  ));
  const result = await provePrivacyWithdrawal({
    withdrawnValue: amountWei.toString(),
    stateRoot: stateProof.root.toString(),
    stateTreeDepth: "32",
    ASPRoot: aspProof.root.toString(),
    ASPTreeDepth: "32",
    context: context.toString(),
    label: selected.details.label,
    existingValue: selected.details.balanceWei,
    existingNullifier: lineage.existingSecrets.nullifier.toString(),
    existingSecret: lineage.existingSecrets.secret.toString(),
    newNullifier: lineage.newSecrets.nullifier.toString(),
    newSecret: lineage.newSecrets.secret.toString(),
    stateSiblings: pad32(stateProof.siblings),
    stateIndex: String(stateProof.index),
    ASPSiblings: pad32(aspProof.siblings),
    ASPIndex: String(aspProof.index),
  }).catch(() => {
    throw new PrivacyDirectUnshieldError("proof-failed");
  });
  const expectedSignals = [
    lineage.newCommitment.toString(),
    lineage.spentNullifier.toString(),
    amountWei.toString(),
    stateProof.root.toString(),
    "32",
    aspProof.root.toString(),
    "32",
    context.toString(),
  ];
  let callData: Hex;
  try {
    callData = encodeDirectWithdrawalCall({
      accountAddress,
      proof: result.proof,
      publicSignals: result.publicSignals,
      expectedSignals,
    });
  } catch {
    throw new PrivacyDirectUnshieldError("proof-failed");
  }
  const gas = await estimateDirectGas(accountAddress, callData);
  const operationId = crypto.randomUUID();
  const createdAt = Date.now();
  const summary: PrivacyDirectUnshieldSummaryV1 = {
    schema: "walletchan-privacy-unshield-v1",
    version: 1,
    method: "direct",
    id: operationId,
    requestId: input.requestId,
    createdAt,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    amountWei: amountWei.toString(),
    netRecipientAmountWei: amountWei.toString(),
    relayFeeWei: "0",
    feeBPS: "0",
    recipient: accountAddress,
    relayerName: "None",
    expiresAt: createdAt + DIRECT_PROOF_TTL_MS,
    recipientMatchesDepositor: accountAddress.toLowerCase() === selected.details.depositor.toLowerCase(),
    accountId: account.id,
    accountAddress,
    accountType: account.type,
    gasLimit: gas.gasLimit.toString(),
    maxFeePerGas: gas.maxFeePerGas.toString(),
    gasFeeEstimateWei: gas.gasFeeEstimateWei.toString(),
  };
  const details: PrivacyDirectUnshieldDetailsV1 = {
    version: 1,
    method: "direct",
    operationId,
    commitmentId: selected.record.id,
    commitmentRevision: selected.record.revision,
    commitmentHash: selected.details.commitment,
    label: selected.details.label,
    balanceWei: selected.details.balanceWei,
    depositIndex: selected.details.depositIndex,
    withdrawalIndex: selected.details.withdrawalIndex,
    expectedSpentNullifier: lineage.spentNullifier.toString(),
    expectedNewCommitment: lineage.newCommitment.toString(),
    expectedNewBalanceWei: lineage.newBalanceWei.toString(),
    expectedNewWithdrawalIndex: lineage.newWithdrawalIndex.toString(),
    stateRoot: stateProof.root.toString(),
    associationRoot: aspProof.root.toString(),
    callData,
  };
  const record: StoredPrivacyUnshieldV1 = {
    summary,
    keyId: material.keyId,
    encryptedDetails: await encryptPrivacyUnshieldDetails(material.key, material.keyId, summary, details),
    tracking: defaultPrivacyUnshieldTracking(summary, "awaiting_wallet_confirmation"),
  };

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try { assertPrivacyMasterAuthorization(expectedEpoch); } catch {
      throw new PrivacyDirectUnshieldError("auth-required");
    }
    await resolveDirectAccount(input);
    const latest = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === selected.record.id);
    if (
      !latest || latest.record.revision !== selected.record.revision ||
      latest.details.status !== "private_ready" ||
      latest.details.commitment !== selected.details.commitment ||
      latest.details.balanceWei !== selected.details.balanceWei
    ) throw new PrivacyDirectUnshieldError("operation-unavailable");
    await assertPrivacyCommitmentSpendable({
      commitment: latest.details,
      masterKeys: material.masterKeys,
    }).catch(() => {
      throw new PrivacyDirectUnshieldError("balance-syncing");
    });
    const currentRoots = await readPrivacyAspOnchainRoots({ expectedStateRoot: stateProof.root });
    if (currentRoots.associationRoot !== aspProof.root || currentRoots.verifiedStateRoot !== stateProof.root) {
      throw new PrivacyDirectUnshieldError("operation-unavailable");
    }
    const committed = await commitPrivacyUnshield(record);
    if (committed.status === "existing") return committed.record;
    try {
      assertPrivacyMasterAuthorization(expectedEpoch);
      const claimed = await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        selected.record.id,
        "withdrawal_pending",
        {
          revision: selected.record.revision,
          status: selected.details.status,
        },
      );
      if (!claimed) {
        throw new PrivacyDirectUnshieldError("balance-syncing");
      }
      return record;
    } catch (error) {
      await deletePrivacyUnshield(record.summary.id).catch(() => undefined);
      throw error;
    }
  });
}
