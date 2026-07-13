/** Atomic EIP-7702 + ERC-7821 local batch execution. */
import { assertAutomaticEip7702AuthorizationAllowed } from "../delegatedAuthorityPolicy";
import { getOnchainDelegate } from "../../utils/delegationResolution";
import { getStoredResolvedChainById } from "../../lib/chains";
import { bumpGasForEip7702Auth } from "../gasEstimation";
import { encodeBatchCalls, omitOuterValueForEip7702 } from "./batchTxEncoding";
import { fetchAndStoreBatchGasData } from "./batchGasEnrichment";
import { handleBatchFailure } from "./batchFailure";
import { processingBundleIds } from "./batchExecutionRuntime";
import { signAndBroadcastTransaction, signEip7702Authorization } from "../localSigner";
import { getNextNonce, resetNonce } from "../forceInclusion/nonceManager";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../pendingRequestLifecycle";
import { guardPendingRequestEffectLease, type PendingRequestEffectLease } from "../pendingRequestResolution";
import { writeResultToStorage } from "../transactions/runtime";
import { applyReceiptToHistory, startReceiptPolling } from "../forceInclusion/receiptPoller";
import { addTxToHistory, updateTxInHistory, type CompletedTransaction } from "../txHistoryStorage";
import { updateBundleStatus } from "../bundleStatusStorage";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";

export interface Atomic7702ExecutionDependencies {
  authorizeBeforeBroadcast: (pending: PendingBatchTxRequest, account: { id: string; address: string; type: string }, beginEffect: () => void) => Promise<void>;
  trackCompletion: (bundleId: string, txHash: string, pending: PendingBatchTxRequest) => Promise<void>;
}

export interface AtomicBatchHistoryMeta {
  swapMeta?: import("./txHistoryStorage").SwapMeta;
  bridge?: import("./txHistoryStorage").BridgeMeta;
}

export async function processAtomic7702LocalBatch(
  dependencies: Atomic7702ExecutionDependencies,
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  delegate: `0x${string}`,
  needsAuthorization: boolean,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  historyMeta?: AtomicBatchHistoryMeta,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const { calls } = pending.params;
  const chainId = pending.chainId;
  const fromAddr = account.address;
  const effectGuard = guardPendingRequestEffectLease(effectLease);

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
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  const displayName = functionNames?.length
    ? `Batch: ${functionNames.join(", ")}`
    : `Batch (${calls.length} calls)`;

  let outerBatchTx: ReturnType<typeof omitOuterValueForEip7702> | null = null;
  try {
    // ERC-7821 calldata, target = the EOA itself (which becomes a smart account
    // for the duration of this tx via the 7702 delegation designator).
    const batchTx = encodeBatchCalls(calls, fromAddr);
    outerBatchTx = omitOuterValueForEip7702(batchTx);

    // Single bundle-level tx history entry — atomic means one onchain tx, one
    // hash, one explorer link, just like Bankr atomic batches.
    //
    // Keep metadata in the initial object literal. The service-worker production
    // build minifies with Terser; it folded the previous conditional spreads to
    // `...{}` and also removed late property assignment before this object
    // escaped to chrome.storage, dropping bridge/swap metadata before storage.
    const historyEntry: CompletedTransaction = {
      id: bundleId,
      status: "processing",
      tx: {
        from: fromAddr,
        to: outerBatchTx.to,
        data: outerBatchTx.data,
        value: outerBatchTx.value,
        chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName: displayName,
      accountId: pending.accountId,
      swapMeta: historyMeta?.swapMeta,
      bridge: historyMeta?.bridge,
    };
    await addTxToHistory(historyEntry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, message);
    effectLease?.release();
    processingBundleIds.delete(bundleId);
    return;
  }

  try {
    if (!outerBatchTx) {
      throw new Error("Failed to encode batch transaction");
    }

    // Reserve the nonce for our tx. If we also need to bundle an authorization,
    // that auth must reference EOA.nonce AFTER this tx is included — which is
    // txNonce + 1 (the EOA's nonce is bumped by inclusion before the auth list
    // is processed; see EIP-7702 "authorization processing" section).
    const txNonce = await getNextNonce(fromAddr, chainId);

    // Race-window defense: `needsAuthorization` was decided at confirm-click
    // time. Between then and now (~100-500ms typically, longer if multiple
    // RPCs ran in parallel) the user could have revoked the delegation via
    // Settings, or a concurrent flow could have changed onchain state. If
    // the EOA is no longer onchain-delegated to a usable contract, force
    // re-authorization so the batch tx self-call still dispatches through
    // the delegate's code. Without this guard a `needsAuthorization=false`
    // decision could ride into a broadcast against a code-less EOA where
    // the ERC-7821 calldata is silently no-op'd by the chain.
    //
    // Only re-checks the onchain delegate; the custom/default fallback was
    // already resolved at confirm-click and shouldn't flip mid-broadcast
    // (those are storage/registry reads, not chain state).
    if (!needsAuthorization && rpcUrl) {
      try {
        const onchain = await getOnchainDelegate(rpcUrl, chainId, fromAddr as `0x${string}`);
        if (!onchain || onchain.toLowerCase() !== delegate.toLowerCase()) {
          console.warn(
            "[atomic-7702] onchain delegate changed between resolve and broadcast — re-authorizing",
            { expected: delegate, actual: onchain },
          );
          needsAuthorization = true;
        }
      } catch (err) {
        // RPC blip during re-check — bundle an auth tuple defensively. The
        // overhead is ~25k gas; the alternative is a silent no-op tx.
        console.warn(
          "[atomic-7702] onchain delegate re-check failed — re-authorizing defensively",
          err,
        );
        needsAuthorization = true;
      }
    }

    let authorizationList:
      | readonly import("viem").SignedAuthorization[]
      | undefined;
    if (needsAuthorization) {
      assertAutomaticEip7702AuthorizationAllowed(delegate);
      const auth = await signEip7702Authorization(privateKey, {
        contractAddress: delegate,
        chainId,
        nonce: txNonce + 1,
        rpcUrl,
        customChainMeta,
      });
      authorizationList = [auth];
    }

    // Use the UI's wrapped atomic estimate exactly when present. That is the
    // value the user reviewed, and it already includes ERC-7821 wrapper cost
    // plus any 7702 state-override behavior. If an older caller passes per-call
    // estimates, sum them without an extra hidden multiplier so signed gas still
    // matches the values shown to the user as closely as that legacy shape allows.
    const summedFromEstimates = precomputedGasEstimates?.reduce(
      (acc, e) => acc + (Number(e?.gasLimit) || 0),
      0,
    );
    // Conservative fallback when the UI didn't precompute. eth_estimateGas can
    // fail on a not-yet-delegated EOA (no code to execute) and the authorization
    // adds ~25k gas of its own, so be generous.
    const fallbackGas = 120_000 * calls.length + 80_000;
    let gasHex =
      summedFromEstimates && summedFromEstimates > 0
        ? `0x${Math.ceil(summedFromEstimates).toString(16)}`
        : `0x${fallbackGas.toString(16)}`;
    // When we're bundling an authorization tuple, neither the UI's
    // state-override simulation nor the fallback above sees the auth's
    // intrinsic cost — it gets added at chain-side intake. Bump with the
    // shared helper so non-standard-gas chains (MegaETH) don't trip
    // "intrinsic gas too low" the way the single Set/Revoke path did.
    if (needsAuthorization) {
      gasHex = `0x${bumpGasForEip7702Auth(
        chainId,
        BigInt(gasHex),
        1,
      ).toString(16)}`;
    }

    // Pick max(maxFeePerGas) and max(maxPriorityFeePerGas) across the
    // per-call estimates as a single combined fee — the atomic path runs
    // every call in one tx, so we use the most aggressive fee.
    let maxFeePerGas: string | undefined;
    let maxPriorityFeePerGas: string | undefined;
    for (const est of precomputedGasEstimates ?? []) {
      if (est?.maxFeePerGas) {
        if (!maxFeePerGas || BigInt(est.maxFeePerGas) > BigInt(maxFeePerGas)) {
          maxFeePerGas = est.maxFeePerGas;
        }
      }
      if (est?.maxPriorityFeePerGas) {
        if (
          !maxPriorityFeePerGas ||
          BigInt(est.maxPriorityFeePerGas) > BigInt(maxPriorityFeePerGas)
        ) {
          maxPriorityFeePerGas = est.maxPriorityFeePerGas;
        }
      }
    }

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
      {
        from: fromAddr,
        to: outerBatchTx.to,
        data: outerBatchTx.data,
        value: outerBatchTx.value,
        chainId,
        nonce: txNonce,
        gas: gasHex,
        maxFeePerGas,
        maxPriorityFeePerGas,
        ...(authorizationList ? { type: "eip7702", authorizationList } : {}),
      },
      rpcUrl,
      customChainMeta,
      () =>
        dependencies.authorizeBeforeBroadcast(
          pending,
          account,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();

    const txHash = result.txHash;

    if (result.receipt) {
      const success =
        result.receipt.status === "success" ||
        (result.receipt.status as unknown) === "0x1";
      await applyReceiptToHistory(bundleId, txHash, chainId, result.receipt, {
        rpcUrl,
        signedGasLimit: result.signedGasLimit,
      });
      await updateBundleStatus(bundleId, {
        status: success ? BUNDLE_STATUS.CONFIRMED : BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
    } else {
      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash,
      });
      startReceiptPolling(bundleId, txHash, chainId);
      // applyReceiptToHistory (called by the poller) only updates tx history.
      // Mirror its terminal status onto the bundle status so the dapp's
      // wallet_getCallsStatus polling sees CONFIRMED / REVERTED.
      void dependencies.trackCompletion(bundleId, txHash, pending);
    }

    fetchAndStoreBatchGasData(bundleId, txHash, chainId);

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash,
    });
  } catch (error) {
    resetNonce(fromAddr, chainId);
    const message = error instanceof Error ? error.message : "Unknown error";
    await handleBatchFailure(bundleId, pending, message);
  } finally {
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
  }
}

// ---------------------------------------------------------------------------
