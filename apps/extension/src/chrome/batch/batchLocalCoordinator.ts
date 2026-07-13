import type { PendingBatchTxRequest } from "../erc5792Types";
import type { GasEstimate } from "../gasEstimation";
import type { PendingRequestEffectLease } from "../requests/pendingRequestResolution";
import {
  processAtomic7702LocalBatch,
  type AtomicBatchHistoryMeta,
} from "./batchAtomic7702Execution";
import {
  trackAtomicBundleCompletion,
  trackNonAtomicBundleCompletion,
} from "./batchCompletionTracking";
import { confirmLocalBatchWithExecutors } from "./batchLocalConfirmation";
import { authorizePendingLocalBatchBroadcast } from "./batchLocalAuthorization";
import { processSequentialLocalBatch } from "./batchSequentialExecution";
import { processSingleLocalBatch } from "./batchSingleExecution";

export async function handleConfirmBatchTransactionPK(
  bundleId: string,
  password: string,
  tabId?: number,
  functionNames?: string[],
  precomputedGasEstimates?: GasEstimate[],
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  return confirmLocalBatchWithExecutors(
    {
      processSingle: processSingleLocalBatch,
      processNonAtomic: processSequentialBatch,
      processAtomic7702: processBatchTransactionAtomic7702InBackground,
    },
    bundleId,
    password,
    tabId,
    functionNames,
    precomputedGasEstimates,
    forceInclusion,
  );
}

function processSequentialBatch(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: GasEstimate[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  return processSequentialLocalBatch(
    trackNonAtomicBundleCompletion,
    bundleId,
    pending,
    account,
    privateKey,
    functionNames,
    precomputedGasEstimates,
    effectLease,
  );
}

/** Public atomic executor reused by the internal swap surface. */
export async function processBatchTransactionAtomic7702InBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  delegate: `0x${string}`,
  needsAuthorization: boolean,
  functionNames?: string[],
  precomputedGasEstimates?: GasEstimate[],
  historyMeta?: AtomicBatchHistoryMeta,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  return processAtomic7702LocalBatch(
    {
      authorizeBeforeBroadcast: authorizePendingLocalBatchBroadcast,
      trackCompletion: trackAtomicBundleCompletion,
    },
    bundleId,
    pending,
    account,
    privateKey,
    delegate,
    needsAuthorization,
    functionNames,
    precomputedGasEstimates,
    historyMeta,
    effectLease,
  );
}
