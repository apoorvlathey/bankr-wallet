import {
  calculateContext,
  generateMerkleProof,
} from "@0xbow/privacy-pools-core-sdk";

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
import { verifyPrivacyPoolsDeployment } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { provePrivacyWithdrawal } from "../prover/coordinator";
import {
  PrivacyRelayerSubmissionError,
  submitPrivacyUnshieldToRelayer,
} from "../relayer/client";
import { decryptPrivacyUnshieldDetails } from "./crypto";
import { derivePrivacyWithdrawalLineage } from "./lineage";
import { startPrivacyUnshieldReceiptTracking } from "./lifecycle";
import {
  getPrivacyUnshieldById,
  updatePrivacyUnshieldTracking,
} from "./repository";
import type {
  PrivacyUnshieldSummaryV1,
  PrivacyUnshieldState,
  PrivacyUnshieldTrackingV1,
  StoredPrivacyUnshieldV1,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function pad32(values: readonly bigint[]): string[] {
  if (values.length > 32) throw new Error("Privacy Pools Merkle proof is too deep");
  return [...values, ...Array<bigint>(32 - values.length).fill(0n)]
    .map((value) => value.toString());
}

async function setState(
  operationId: string,
  state: PrivacyUnshieldState,
  patch: Partial<Omit<PrivacyUnshieldTrackingV1, "version" | "revision" | "state" | "updatedAt">> = {},
): Promise<StoredPrivacyUnshieldV1> {
  const record = await updatePrivacyUnshieldTracking(
    operationId,
    (current) => advance(current, state, patch),
  );
  if (!record) throw new Error("Unshield operation is unavailable");
  return record;
}

/** Generate an exact local proof and submit it through the intent-bound relayer. */
export async function executePrivacyUnshield(
  operationId: string,
): Promise<StoredPrivacyUnshieldV1> {
  if (!UUID.test(operationId)) throw new Error("invalid-request");
  const expectedEpoch = await capturePrivacyMasterAuthorization();
  await verifyPrivacyPoolsDeployment();
  const material = await readPrivacyAspMasterMaterial();
  if (!material) throw new Error("auth-required");

  const claimed = await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    assertPrivacyMasterAuthorization(expectedEpoch);
    const operation = await getPrivacyUnshieldById(operationId);
    if (!operation || operation.keyId !== material.keyId || operation.tracking.state !== "quote_ready") {
      throw new Error("operation-unavailable");
    }
    if (operation.summary.expiresAt <= Date.now()) {
      await setState(operationId, "quote_expired", { errorCode: "quote-expired" });
      throw new Error("quote-expired");
    }
    const details = await decryptPrivacyUnshieldDetails(material.key, operation);
    if (!details || operation.summary.method === "direct" || "method" in details) {
      throw new Error("operation-unavailable");
    }
    const commitment = (await readPrivacyCommitments(material.key, material.keyId))
      .find((item) => item.record.id === details.commitmentId);
    if (
      !commitment || commitment.record.revision !== details.commitmentRevision ||
      commitment.details.commitment !== details.commitmentHash ||
      commitment.details.balanceWei !== details.balanceWei ||
      commitment.details.withdrawalIndex !== details.withdrawalIndex ||
      commitment.details.status !== "private_ready"
    ) throw new Error("operation-unavailable");
    const lineage = derivePrivacyWithdrawalLineage({
      commitment: commitment.details,
      masterKeys: material.masterKeys,
      amountWei: BigInt(operation.summary.amountWei),
    });
    if (
      lineage.spentNullifier.toString() !== details.expectedSpentNullifier ||
      lineage.newCommitment.toString() !== details.expectedNewCommitment ||
      lineage.newBalanceWei.toString() !== details.expectedNewBalanceWei ||
      lineage.newWithdrawalIndex.toString() !== details.expectedNewWithdrawalIndex
    ) throw new Error("operation-unavailable");
    const claimedCommitment = await updatePrivacyCommitmentStatus(
      material.key,
      material.keyId,
      commitment.record.id,
      "withdrawal_pending",
      {
        revision: commitment.record.revision,
        status: commitment.details.status,
      },
    );
    if (!claimedCommitment) throw new Error("operation-unavailable");
    try {
      await setState(operationId, "proof_preparing");
    } catch (error) {
      await updatePrivacyCommitmentStatus(
        material.key,
        material.keyId,
        commitment.record.id,
        "private_ready",
        {
          revision: commitment.record.revision + 1,
          status: "withdrawal_pending",
        },
      );
      throw error;
    }
    return { operation, details, commitment, lineage };
  });

  let effectStarted = false;
  try {
    const [roots, leaves] = await Promise.all([
      fetchPrivacyAspRoots(),
      fetchPrivacyAspLeaves(),
    ]);
    const onchain = await readPrivacyAspOnchainRoots({
      expectedStateRoot: BigInt(roots.onchainMtRoot),
    });
    if (
      BigInt(roots.mtRoot) !== onchain.associationRoot ||
      BigInt(roots.onchainMtRoot) !== onchain.verifiedStateRoot
    ) throw new Error("privacy-roots-changed");
    const aspProof = generateMerkleProof(
      leaves.aspLeaves.map(BigInt),
      BigInt(claimed.details.label),
    );
    const stateProof = generateMerkleProof(
      leaves.stateTreeLeaves.map(BigInt),
      BigInt(claimed.details.commitmentHash),
    );
    if (
      aspProof.root !== onchain.associationRoot ||
      stateProof.root !== onchain.verifiedStateRoot
    ) {
      throw new Error("privacy-membership-changed");
    }
    const context = BigInt(calculateContext(
      {
        processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
        data: claimed.details.feeCommitment.withdrawalData,
      },
      PRIVACY_POOLS_DEPLOYMENT.scope as never,
    ));
    const proof = await provePrivacyWithdrawal({
      withdrawnValue: claimed.operation.summary.amountWei,
      stateRoot: stateProof.root.toString(),
      stateTreeDepth: "32",
      ASPRoot: aspProof.root.toString(),
      ASPTreeDepth: "32",
      context: context.toString(),
      label: claimed.details.label,
      existingValue: claimed.details.balanceWei,
      existingNullifier: claimed.lineage.existingSecrets.nullifier.toString(),
      existingSecret: claimed.lineage.existingSecrets.secret.toString(),
      newNullifier: claimed.lineage.newSecrets.nullifier.toString(),
      newSecret: claimed.lineage.newSecrets.secret.toString(),
      stateSiblings: pad32(stateProof.siblings),
      stateIndex: String(stateProof.index),
      ASPSiblings: pad32(aspProof.siblings),
      ASPIndex: String(aspProof.index),
    });
    const expectedSignals = [
      claimed.details.expectedNewCommitment,
      claimed.details.expectedSpentNullifier,
      claimed.operation.summary.amountWei,
      stateProof.root.toString(),
      "32",
      aspProof.root.toString(),
      "32",
      context.toString(),
    ];
    if (
      proof.publicSignals.length !== expectedSignals.length ||
      proof.publicSignals.some((signal, index) => BigInt(signal) !== BigInt(expectedSignals[index]))
    ) throw new Error("proof-public-signals-mismatch");
    assertPrivacyMasterAuthorization(expectedEpoch);
    if (claimed.operation.summary.expiresAt <= Date.now()) throw new Error("quote-expired");
    const currentRoots = await readPrivacyAspOnchainRoots({
      expectedStateRoot: stateProof.root,
    });
    if (
      currentRoots.associationRoot !== aspProof.root ||
      currentRoots.verifiedStateRoot !== stateProof.root
    ) throw new Error("privacy-roots-changed");
    await setState(operationId, "proof_verified");
    assertPrivacyMasterAuthorization(expectedEpoch);
    await setState(operationId, "submitting_to_relayer");
    effectStarted = true;
    const submitted = await submitPrivacyUnshieldToRelayer({
      summary: claimed.operation.summary as PrivacyUnshieldSummaryV1,
      details: claimed.details,
      proof: proof.proof,
      publicSignals: proof.publicSignals,
      beforeSubmit: () => assertPrivacyMasterAuthorization(expectedEpoch),
    });
    const updated = await setState(operationId, "submitted", {
      relayerRequestId: submitted.requestId,
      txHash: submitted.txHash,
      errorCode: null,
    });
    startPrivacyUnshieldReceiptTracking(operationId, submitted.txHash);
    return updated;
  } catch (error) {
    const ambiguous = effectStarted &&
      error instanceof PrivacyRelayerSubmissionError && error.kind === "ambiguous";
    const rejected = effectStarted &&
      error instanceof PrivacyRelayerSubmissionError && error.kind === "rejected";
    const quoteExpired = error instanceof Error && error.message === "quote-expired";
    await setState(
      operationId,
      ambiguous ? "submission_unknown" :
        rejected ? "relayer_rejected" :
          quoteExpired ? "quote_expired" : "proof_failed",
      { errorCode: ambiguous ? "submission-unknown" : rejected ? "relayer-rejected" : quoteExpired ? "quote-expired" : "proof-failed" },
    ).catch(() => undefined);
    if (!ambiguous) {
      await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
        const commitment = (await readPrivacyCommitments(material.key, material.keyId))
          .find((item) => item.record.id === claimed.details.commitmentId);
        if (
          commitment?.details.status === "withdrawal_pending" &&
          commitment.details.commitment === claimed.details.commitmentHash
        ) {
          await updatePrivacyCommitmentStatus(
            material.key,
            material.keyId,
            commitment.record.id,
            "private_ready",
            {
              revision: claimed.details.commitmentRevision + 1,
              status: "withdrawal_pending",
            },
          );
        }
      }).catch(() => undefined);
    }
    throw error;
  }
}
