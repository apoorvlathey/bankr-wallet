import { getStoredResolvedChainById } from "../../lib/chains";
import { updateBundleStatus } from "./bundleStatusStorage";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { getNextNonce, resetNonce } from "../forceInclusion/nonceManager";
import {
  applyReceiptToHistory,
  startReceiptPolling,
} from "../forceInclusion/receiptPoller";
import { signAndBroadcastTransaction } from "../localSigner";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { writeResultToStorage } from "../transactions/runtime";
import { fetchAndStoreBatchGasData } from "./batchGasEnrichment";
import { handleBatchFailure } from "./batchFailure";
import { authorizePendingLocalBatchBroadcast } from "./batchLocalAuthorization";
import { trackAtomicBundleCompletion } from "./batchCompletionTracking";
import { processingBundleIds } from "./batchExecutionRuntime";

/** Execute a one-call local batch without ERC-7821/EIP-7702 overhead. */
export async function processSingleLocalBatch(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("../gasEstimation").GasEstimate[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const call = pending.params.calls[0];
  const chainId = pending.chainId;
  const fromAddress = account.address;
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
    const resolvedChain = await getStoredResolvedChainById(chainId);
    const rpcUrl = resolvedChain?.rpcUrl;
    const customChainMeta = resolvedChain?.isCustom
      ? {
          name: resolvedChain.name,
          nativeCurrency: resolvedChain.nativeCurrency,
          explorer: resolvedChain.explorer || undefined,
        }
      : undefined;
    await addTxToHistory({
      id: bundleId,
      status: "processing",
      tx: {
        from: fromAddress,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName:
        functionNames?.[0] || `Batch (${pending.params.calls.length} call)`,
    });
    attachClearSignedMetaToHistory(
      bundleId,
      { to: call.to, data: call.data, value: call.value },
      chainId,
    );

    const nonce = await getNextNonce(fromAddress, chainId);
    const estimate = precomputedGasEstimates?.[0];
    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "batchTransaction",
        pending,
      );
    if (!authorization.authorized) throw new Error(authorization.error);

    const result = await signAndBroadcastTransaction(
      privateKey,
      {
        from: fromAddress,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId,
        nonce,
        gas: estimate?.gasLimit || "500000",
        maxFeePerGas: estimate?.maxFeePerGas || undefined,
        maxPriorityFeePerGas:
          estimate?.maxPriorityFeePerGas || undefined,
      },
      rpcUrl,
      customChainMeta,
      () =>
        authorizePendingLocalBatchBroadcast(
          pending,
          account,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();

    if (result.receipt) {
      await applyReceiptToHistory(
        bundleId,
        result.txHash,
        chainId,
        result.receipt,
        { rpcUrl, signedGasLimit: result.signedGasLimit },
      );
      await updateBundleStatus(bundleId, {
        status:
          result.receipt.status === "success" ||
          (result.receipt.status as unknown) === "0x1"
            ? BUNDLE_STATUS.CONFIRMED
            : BUNDLE_STATUS.REVERTED,
        txHash: result.txHash,
        completedAt: Date.now(),
      });
    } else {
      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash: result.txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash: result.txHash,
      });
      startReceiptPolling(bundleId, result.txHash, chainId);
      void trackAtomicBundleCompletion(bundleId, result.txHash, pending);
    }
    fetchAndStoreBatchGasData(bundleId, result.txHash, chainId);
    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: result.txHash,
    });
  } catch (error) {
    resetNonce(fromAddress, chainId);
    const message = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, message);
  } finally {
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
  }
}
