/** Sequential PK/seed batch execution state machine. */
import type { BundleReceipt, ERC5792Call, PendingBatchTxRequest } from "../erc5792Types";
import { BUNDLE_STATUS } from "../erc5792Types";
import { getStoredResolvedChainById } from "../../lib/chains";
import { signAndBroadcastTransaction, isBroadcastOutcomeUncertain } from "../localSigner";
import { getNextNonce, resetNonce } from "../forceInclusion/nonceManager";
import { guardPendingRequestEffectLease, type PendingRequestEffectLease } from "../pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { updateBundleStatus } from "../bundleStatusStorage";
import { applyReceiptToHistory, startReceiptPolling } from "../forceInclusion/receiptPoller";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import { writeResultToStorage } from "../transactions/runtime";
import { handleBatchFailure } from "./batchFailure";
import { showNotification } from "../txHandlers";
import { processingBundleIds } from "./batchExecutionRuntime";

export async function processSequentialLocalBatch(
  trackCompletion: (bundleId: string, pending: PendingBatchTxRequest, results: Array<{ txId: string; success: boolean; txHash?: string; receipt?: BundleReceipt; error?: string }>) => void,
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("../gasEstimation").GasEstimate[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const { calls } = pending.params;
  const chainId = pending.chainId;
  const fromAddr = account.address;
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  let rpcUrl: string | undefined;
  let customChainMeta: Parameters<typeof signAndBroadcastTransaction>[3];
  const prepared: Array<{
    txId: string;
    call: ERC5792Call;
    nonce: number;
    functionName?: string;
  }> = [];

  try {
  let resolvedChain: Awaited<ReturnType<typeof getStoredResolvedChainById>>;
  try {
    resolvedChain = await getStoredResolvedChainById(chainId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve chain";
    await handleBatchFailure(bundleId, pending, message);
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
    return;
  }
  rpcUrl = resolvedChain?.rpcUrl;
  customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  // Phase 1 (sequential): assign nonces + write history entries
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const txId = `${bundleId}:${i}`;
      const nonce = await getNextNonce(fromAddr, chainId);
      const fnName = functionNames?.[i] || `Batch call ${i + 1}/${calls.length}`;

      await addTxToHistory({
        id: txId,
        status: "processing",
        tx: {
          from: fromAddr,
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
        functionName: fnName,
      });

      // Snapshot clear-signed summary for the per-call activity row.
      attachClearSignedMetaToHistory(
        txId,
        { to: call.to, data: call.data, value: call.value },
        chainId,
      );

      prepared.push({ txId, call, nonce, functionName: fnName });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to prepare batch";
    await handleBatchFailure(bundleId, pending, errorMessage);
    effectLease?.release();
    processingBundleIds.delete(bundleId);
    return;
  }

  // Use pre-computed gas estimates from the UI if available (avoids duplicate RPC calls).
  // Otherwise, compute them now so dependent calls (e.g., swap after approve) get valid
  // gas limits without needing onchain state from prior calls.
  let gasEstimates = precomputedGasEstimates;
  if (!gasEstimates || gasEstimates.length !== calls.length) {
    try {
      const { estimateBatchGasSequential } = await import("../batchGasEstimation");
      gasEstimates = await estimateBatchGasSequential(
        calls.map((c) => ({
          to: c.to || "0x0000000000000000000000000000000000000000",
          data: c.data || "0x",
          value: c.value || "0x0",
        })),
        fromAddr,
        chainId,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to estimate batch gas";
      await handleBatchFailure(bundleId, pending, errorMessage);
      effectGuard.releaseIfSafe();
      processingBundleIds.delete(bundleId);
      return;
    }
  }

  // Phase 2 (ordered broadcast): sign + broadcast each pre-assigned nonce only
  // after the previous raw tx was accepted. Later nonce txs must not enter the
  // mempool if an earlier nonce fails before broadcast, otherwise a future user
  // tx can fill the gap and release stale batch tail transactions.
  const txHashes: string[] = [];
  const results: Array<{
    txId: string;
    success: boolean;
    txHash?: string;
    error?: string;
    broadcastUncertain?: boolean;
  }> = [];

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    try {
      const est = gasEstimates[i];
      const txForSigning = {
        from: fromAddr,
        to: item.call.to || "0x0000000000000000000000000000000000000000",
        data: item.call.data || "0x",
        value: item.call.value || "0x0",
        chainId,
        nonce: item.nonce,
        gas: est?.gasLimit || "500000",
        maxFeePerGas: est?.maxFeePerGas || undefined,
        maxPriorityFeePerGas: est?.maxPriorityFeePerGas || undefined,
      };

      const authorization =
        await enforcePendingRequestAuthorizationAtConfirmation(
          "batchTransaction",
          pending,
        );
      if (!authorization.authorized) {
        throw new Error(authorization.error);
      }

      const result = await signAndBroadcastTransaction(
        privateKey,
        txForSigning,
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

      // Sync-send chains return the receipt with the broadcast — jump straight
      // to the final state with no intermediate "pending" flash. Otherwise mark
      // pending and start individual receipt polling (exponential backoff
      // 2s→30s to avoid rate-limiting). Bundle status is tracked separately
      // via local storage polling.
      if (result.receipt) {
        await applyReceiptToHistory(item.txId, result.txHash, chainId, result.receipt, {
          rpcUrl,
          signedGasLimit: result.signedGasLimit,
        });
      } else {
        await updateTxInHistory(item.txId, {
          status: "pending",
          txHash: result.txHash,
          broadcastUncertain: result.broadcastUncertain === true,
        });
        startReceiptPolling(item.txId, result.txHash, chainId);
      }

      const broadcastUncertain = isBroadcastOutcomeUncertain(result);
      results.push({
        txId: item.txId,
        success: true,
        txHash: result.txHash,
        broadcastUncertain,
      });
      if (broadcastUncertain) {
        const skippedError =
          "Skipped because the previous transaction's broadcast is still unconfirmed";
        for (const skipped of prepared.slice(i + 1)) {
          await updateTxInHistory(skipped.txId, {
            status: "failed",
            error: skippedError,
            completedAt: Date.now(),
          });
          results.push({
            txId: skipped.txId,
            success: false,
            error: skippedError,
          });
        }
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      resetNonce(fromAddr, chainId);

      await updateTxInHistory(item.txId, {
        status: "failed",
        error: errorMessage,
        completedAt: Date.now(),
      });

      results.push({ txId: item.txId, success: false, error: errorMessage });

      const skippedError =
        "Skipped because an earlier batch transaction failed to broadcast";
      for (const skipped of prepared.slice(i + 1)) {
        await updateTxInHistory(skipped.txId, {
          status: "failed",
          error: skippedError,
          completedAt: Date.now(),
        });
        results.push({
          txId: skipped.txId,
          success: false,
          error: skippedError,
        });
      }
      break;
    }
  }

  // Collect tx hashes for bundle status
  for (const r of results) {
    if (r.txHash) txHashes.push(r.txHash);
  }

  const allSuccess = results.every((r) => r.success);
  const allFailed = results.every((r) => !r.success);

  // Update bundle status
  if (allFailed) {
    const firstError = results.find((r) => r.error)?.error || "All transactions failed";
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      txHashes,
      error: firstError,
      completedAt: Date.now(),
    });

    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Failed",
      `Batch transaction on ${pending.chainName} failed: ${firstError}`,
    );

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: false,
      error: firstError,
    });
  } else {
    // At least some txs were broadcast — mark as pending, let receipt polling finalize.
    // Use the LAST tx hash as the primary one (dapps show this to the user,
    // and the last call is typically the meaningful action, e.g., swap after approve).
    const primaryTxHash = txHashes[txHashes.length - 1] || txHashes[0];
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHashes,
      txHash: primaryTxHash,
    });

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: primaryTxHash,
    });

    // If some failed but others succeeded, show partial notification
    if (!allSuccess) {
      const failedCount = results.filter((r) => !r.success).length;
      await showNotification(
        `tx-partial-${bundleId}`,
        "Batch Partially Failed",
        `${failedCount}/${calls.length} calls failed or were skipped on ${pending.chainName}`,
      );
    }

    // Start aggregate status tracking — when all receipts resolve, compute final status
    trackCompletion(bundleId, pending, results);
  }

  processingBundleIds.delete(bundleId);
  effectGuard.releaseIfSafe();
}
