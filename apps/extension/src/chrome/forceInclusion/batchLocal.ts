import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import type { GasEstimate } from "../gasEstimation";
import type { PendingBatchTxRequest } from "../erc5792Types";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { broadcastLocalForceInclusionBatch } from "./batchLocalBroadcast";
import { prepareLocalForceInclusionBatch } from "./batchLocalPreparation";
import { finalizeLocalForceInclusionBatch } from "./batchLocalReceipts";
import { writeBatchForceInclusionFailure } from "./batchFailure";
import type { ForceInclusionAccount } from "./types";

export async function processForceInclusionBatchLocal(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: ForceInclusionAccount,
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedL2GasEstimates?: GasEstimate[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
    if (!info) {
      await writeBatchForceInclusionFailure(
        bundleId,
        pending,
        "Chain does not support force inclusion",
      );
      effectGuard.releaseIfSafe();
      return;
    }

    let prepared;
    try {
      prepared = await prepareLocalForceInclusionBatch({
        bundleId,
        pending,
        account,
        info,
        privateKey,
        functionNames,
        precomputedL2GasEstimates,
      });
    } catch (error: any) {
      await writeBatchForceInclusionFailure(
        bundleId,
        pending,
        `Failed to build deposit txs: ${error?.message || "Unknown error"}`,
      );
      effectGuard.releaseIfSafe();
      return;
    }
    const results = await broadcastLocalForceInclusionBatch({
      pending,
      account,
      prepared,
      effectGuard,
    });
    effectGuard.releaseIfSafe();
    await finalizeLocalForceInclusionBatch({
      bundleId,
      pending,
      prepared,
      results,
    });
  } catch (error) {
    await writeBatchForceInclusionFailure(
      bundleId,
      pending,
      error instanceof Error ? error.message : "Force inclusion failed",
    );
  } finally {
    effectGuard.releaseIfSafe();
  }
}
