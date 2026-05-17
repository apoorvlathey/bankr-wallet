/**
 * Force Inclusion for ERC-5792 Batch Transactions
 *
 * Two paths:
 *   - Bankr API (atomic): encode batch as single ERC-7821 tx, wrap as L1 deposit
 *   - PK/Seed (non-atomic): wrap each call as separate L1 deposit, broadcast concurrently
 */

import {
  createWalletClient,
  http,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  FORCE_INCLUSION_CHAINS,
} from "@/constants/chainRegistry";
import { submitTransactionDirect, type TransactionParams } from "./bankrApi";
import {
  addTxToHistory,
  updateTxInHistory,
} from "./txHistoryStorage";
import { attachClearSignedMetaToHistory } from "./clearSignedMetaSnapshot";
import {
  buildL1DepositTxParams,
  extractL2Hash,
  getL1RpcUrl,
  getL1Chain,
  createL1PublicClient,
  writeForceInclusionProgress,
  L1_RPC_TIMEOUT,
  L1_RECEIPT_TIMEOUT,
  type ForceInclusionStage,
  type ForceInclusionProgressData,
} from "./forceInclusion";
import { estimateFees } from "./feeEstimation";
import type { PendingBatchTxRequest } from "./erc5792Types";

// ---------------------------------------------------------------------------
// Bankr API (atomic) batch — force inclusion
// ---------------------------------------------------------------------------

export async function processForceInclusionBatchBankr(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  functionNames?: string[],
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
  if (!info) {
    await handleBatchForceInclusionFailure(bundleId, pending, "Chain does not support force inclusion");
    return;
  }

  const progress = (
    stage: ForceInclusionStage,
    extra?: Partial<ForceInclusionProgressData>,
  ) =>
    writeForceInclusionProgress(bundleId, {
      stage,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.chainId,
      timestamp: Date.now(),
      ...extra,
    });

  // Get account address for ERC-7821 encoding (self-call target)
  const { getActiveAccount } = await import("./accountStorage");
  const account = await getActiveAccount();
  if (!account) {
    await handleBatchForceInclusionFailure(bundleId, pending, "No active account");
    return;
  }

  // Encode calls into single ERC-7821 tx
  const { encodeBatchCalls } = await import("./batchTxHandlers");
  const batchTx = encodeBatchCalls(pending.params.calls, account.address);

  // Create synthetic L2 tx from the encoded batch
  const syntheticL2Tx: TransactionParams = {
    from: account.address,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId: pending.chainId,
  };

  const displayName = functionNames?.length
    ? `Batch: ${functionNames.join(", ")} (Force Inclusion)`
    : `Batch (${pending.params.calls.length} calls) (Force Inclusion)`;

  // Save to tx history with forceInclusionMeta from the start
  await addTxToHistory({
    id: bundleId,
    status: "processing",
    tx: syntheticL2Tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName: displayName,
    forceInclusionMeta: {
      l1TxHash: "",
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.chainId,
      l2Confirmed: false,
    },
  });

  try {
    // Stage 1: Build L1 deposit tx
    await progress("building");
    const l1TxParams = await buildL1DepositTxParams(syntheticL2Tx, info);

    // Stage 2: Submit to Bankr API
    await progress("submitting");
    const result = await submitTransactionDirect(apiKey, l1TxParams);
    const l1Hash = result.transactionHash;

    if (result.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted" });
      await handleBatchForceInclusionFailure(bundleId, pending, "L1 deposit transaction reverted");
      return;
    }

    // Update history with L1 hash immediately
    await updateTxInHistory(bundleId, {
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });

    // Stage 3: Wait for L1 receipt & extract L2 hash
    await progress("waiting-l1", { l1Hash });
    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Client = createL1PublicClient(l1RpcUrl);
    const receipt = await l1Client.waitForTransactionReceipt({
      hash: l1Hash as Hash,
      timeout: L1_RECEIPT_TIMEOUT,
    });

    // Critical: L1 tx may have reverted onchain even if it was broadcast successfully
    if (receipt.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted onchain" });
      await handleBatchForceInclusionFailure(bundleId, pending, "L1 deposit transaction reverted onchain");
      return;
    }

    const l2Hash = extractL2Hash(receipt);
    const resultHash = l2Hash || l1Hash;
    await progress("complete", { l1Hash, l2Hash: l2Hash || undefined });

    // Mark as "pending" — L1 confirmed, awaiting L2 sequencer inclusion
    await updateTxInHistory(bundleId, {
      status: "pending",
      txHash: resultHash,
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });

    // Update bundle status
    const { updateBundleStatus } = await import("./bundleStatusStorage");
    const { BUNDLE_STATUS } = await import("./erc5792Types");
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHash: resultHash,
    });

    // Show notification + write result for dapp
    const { CHAIN_CONFIG } = await import("@/constants/chainConfig");
    const { showNotification, writeResultToStorage } = await import("./txHandlers");

    const l1ChainConfig = CHAIN_CONFIG[info.l1ChainId];
    const l1ExplorerUrl = l1ChainConfig?.explorer
      ? `${l1ChainConfig.explorer}/tx/${l1Hash}`
      : null;
    if (l1ExplorerUrl) {
      chrome.storage.local.set({
        [`notification-tx-success-${bundleId}`]: l1ExplorerUrl,
      });
    }

    await showNotification(
      `tx-success-${bundleId}`,
      "L1 Batch Deposit Confirmed",
      `Batch deposit confirmed on ${info.l1ChainName}. Awaiting L2 inclusion (~1-10 min).`,
    );

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: resultHash,
    });

    // Start L2 receipt polling if we have an L2 hash
    if (l2Hash) {
      const { startReceiptPolling } = await import("./txReceiptPoller");
      startReceiptPolling(bundleId, l2Hash, pending.chainId);
    }
  } catch (err: any) {
    const error = err?.shortMessage || err?.message || "Force inclusion failed";
    await progress("error", { error });
    await handleBatchForceInclusionFailure(bundleId, pending, error);
  }
}

// ---------------------------------------------------------------------------
// PK/Seed (non-atomic) batch — force inclusion
// ---------------------------------------------------------------------------

export async function processForceInclusionBatchLocal(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  /**
   * L2 gas estimates pre-computed by the UI (possibly edited by the user).
   * Only the `gasLimit` field is used — as the `_gasLimit` baked into the
   * portal call. L1 fees are still computed onchain at broadcast.
   */
  precomputedL2GasEstimates?: import("./gasEstimation").GasEstimate[],
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
  if (!info) {
    await handleBatchForceInclusionFailure(bundleId, pending, "Chain does not support force inclusion");
    return;
  }

  const { calls } = pending.params;
  const l1ChainId = info.l1ChainId;

  const l1RpcUrl = await getL1RpcUrl(l1ChainId);
  const l1Chain = getL1Chain(l1ChainId);
  const viemAccount = privateKeyToAccount(privateKey);
  const l1PublicClient = createL1PublicClient(l1RpcUrl);

  // Get sequential L2 gas estimates. Prefer the pre-computed values from the UI
  // (these may include user edits applied in MultiTxGasEstimateDisplay's edit
  // inputs). Fall back to running estimateBatchGasSequential here if the UI
  // didn't provide any — shares the exact same logic as the normal non-atomic
  // batch flow (eth_simulateV1 → per-call estimateGas fallback).
  //
  // The _gasLimit passed to the portal matters because OptimismPortal.Burn.gas()
  // burns L1 gas proportional to it. Using DEFAULT_L2_GAS (8M) for every call
  // would waste significant L1 gas on the burn.
  let l2GasEstimates: import("./gasEstimation").GasEstimate[];
  if (precomputedL2GasEstimates && precomputedL2GasEstimates.length === calls.length) {
    l2GasEstimates = precomputedL2GasEstimates;
  } else {
    const { estimateBatchGasSequential } = await import("./batchGasEstimation");
    l2GasEstimates = await estimateBatchGasSequential(
      calls.map((c) => ({
        to: c.to || "0x0000000000000000000000000000000000000000",
        data: c.data || "0x",
        value: c.value || "0x0",
      })),
      account.address,
      pending.chainId,
    );
  }

  // Phase 1: Build L1 deposit tx params for each call in parallel using the
  // sequential L2 gas estimate (or fallback if estimation failed).
  const depositParamsPromises = calls.map(async (call, i) => {
    const syntheticTx: TransactionParams = {
      from: account.address,
      to: call.to || "0x0000000000000000000000000000000000000000",
      data: call.data || "0x",
      value: call.value || "0x0",
      chainId: pending.chainId,
    };
    const est = l2GasEstimates[i];
    // If estimation truly failed (no RPC URL), pass undefined so
    // buildL1DepositTxParams falls back to DEFAULT_L2_GAS. Otherwise use the
    // (possibly user-edited) gas limit as-is.
    const l2GasOverride = est?.estimationFailed
      ? undefined
      : BigInt(est.gasLimit);
    return buildL1DepositTxParams(syntheticTx, info, l2GasOverride);
  });

  let depositParamsArray: TransactionParams[];
  try {
    depositParamsArray = await Promise.all(depositParamsPromises);
  } catch (err: any) {
    await handleBatchForceInclusionFailure(
      bundleId, pending,
      `Failed to build deposit txs: ${err?.message || "Unknown error"}`,
    );
    return;
  }

  // Get L1 starting nonce and fees (one RPC call each, shared for all deposits).
  //
  // Use blockTag: "pending" so we account for any in-flight L1 tx the user
  // might already have. The default ("latest") returns the last *mined* nonce
  // and would collide with anything the user broadcast in the last few blocks.
  const [startNonce, l1Fees] = await Promise.all([
    l1PublicClient.getTransactionCount({
      address: viemAccount.address,
      blockTag: "pending",
    }),
    estimateFees(l1PublicClient, l1ChainId).catch(() => null),
  ]);

  try {
    const host = new URL(l1RpcUrl).host;
    console.log(
      `[ForceInclusion] batch start: bundleId=${bundleId} l1Host=${host} l1ChainId=${l1ChainId} calls=${calls.length} startNonce=${startNonce} maxFeePerGas=${l1Fees?.maxFeePerGas?.toString() ?? "auto"} maxPriorityFeePerGas=${l1Fees?.maxPriorityFeePerGas?.toString() ?? "auto"}`,
    );
  } catch {
    // ignore URL parse failure
  }

  // Phase 2: Assign nonces, save sub-txs to history
  const prepared: Array<{
    txId: string;
    nonce: number;
    l1TxParams: TransactionParams;
    functionName: string;
  }> = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const txId = `${bundleId}:${i}`;
    const fnName = functionNames?.[i] || `Batch call ${i + 1}/${calls.length}`;

    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: {
        from: account.address,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId: pending.chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName: fnName,
      forceInclusionMeta: {
        l1TxHash: "",
        l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });

    // Snapshot clear-signed summary for the per-call activity row.
    attachClearSignedMetaToHistory(
      txId,
      { to: call.to, data: call.data, value: call.value },
      pending.chainId,
    );

    prepared.push({
      txId,
      nonce: startNonce + i,
      l1TxParams: depositParamsArray[i],
      functionName: fnName,
    });
  }

  // Phase 2.5: Estimate L1 gas for each deposit in parallel.
  // Critical: the OptimismPortal's Burn.gas() resource metering loop burns gas
  // proportional to the L2 gas requested. A hardcoded gas limit (e.g. 200k)
  // will revert with "out of gas" inside Burn.sol for any deposit with high L2 gas.
  const l1GasLimits = await Promise.all(prepared.map(async (item) => {
    const value = item.l1TxParams.value && item.l1TxParams.value !== "0x0"
      ? BigInt(item.l1TxParams.value)
      : 0n;
    try {
      const estimated = await l1PublicClient.estimateGas({
        account: viemAccount.address,
        to: item.l1TxParams.to as `0x${string}`,
        data: item.l1TxParams.data as `0x${string}`,
        value,
      });
      // 20% buffer to account for any non-determinism
      return (estimated * 120n) / 100n;
    } catch (err) {
      console.warn(`[ForceInclusion] L1 gas estimation failed for ${item.txId}, using 1M fallback:`, err);
      // Safe fallback for high L2 gas deposits (burn cost can be ~300k+)
      return 1_000_000n;
    }
  }));

  // Phase 3: Broadcast L1 deposit txs sequentially.
  //
  // We MUST broadcast sequentially (not Promise.all) for two reasons:
  //
  //   1. Nonce ordering on strict RPCs. Alchemy/Infura/most managed L1 RPCs
  //      will silently park nonce N+1 in the "queued" pool if it arrives
  //      before nonce N — and then frequently evict it without ever
  //      propagating to peers. The node still returns a hash from
  //      eth_sendRawTransaction (the hash is computed locally from the
  //      signed bytes, not from network state), so we record the hash and
  //      show "L1 Pending", but the tx never reaches the actual mempool
  //      → never appears on Etherscan → user is stuck forever.
  //
  //   2. Determinism on partial failure. If broadcast i fails, we want
  //      broadcasts i+1..N-1 to be skipped (not also fail with their own
  //      ambiguous errors), so the user gets a single clean failure instead
  //      of N stuck "pending" rows.
  //
  // The sequential await is also fine on cost: the typical batch is 2 calls
  // (approve + swap), so this adds at most ~1s vs the parallel path.
  const l1WalletClient = createWalletClient({
    account: viemAccount,
    chain: l1Chain,
    transport: http(l1RpcUrl, { timeout: L1_RPC_TIMEOUT }),
  });

  type BroadcastResult = {
    txId: string;
    success: boolean;
    l1TxHash?: string;
    error?: string;
  };
  const results: BroadcastResult[] = [];

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    const value =
      item.l1TxParams.value && item.l1TxParams.value !== "0x0"
        ? BigInt(item.l1TxParams.value)
        : 0n;

    console.log(
      `[ForceInclusion] broadcasting L1 deposit ${i + 1}/${prepared.length}: txId=${item.txId} nonce=${item.nonce} gas=${l1GasLimits[i].toString()} value=${value.toString()}`,
    );

    try {
      const l1Hash = await l1WalletClient.sendTransaction({
        to: item.l1TxParams.to as `0x${string}`,
        data: item.l1TxParams.data as `0x${string}`,
        value,
        nonce: item.nonce,
        gas: l1GasLimits[i],
        maxFeePerGas: l1Fees?.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: l1Fees?.maxPriorityFeePerGas ?? undefined,
      });

      console.log(
        `[ForceInclusion] L1 deposit ${i + 1}/${prepared.length} accepted by RPC: hash=${l1Hash}`,
      );

      // Update sub-tx with L1 hash immediately so activity feed can link to it
      await updateTxInHistory(item.txId, {
        forceInclusionMeta: {
          l1TxHash: l1Hash,
          l1ChainId,
          l2ChainId: pending.chainId,
          l2Confirmed: false,
        },
      });

      results.push({ txId: item.txId, success: true, l1TxHash: l1Hash });
    } catch (err: any) {
      const errorMsg =
        err?.shortMessage || err?.message || "L1 broadcast failed";
      console.warn(
        `[ForceInclusion] L1 deposit ${i + 1}/${prepared.length} broadcast failed: ${errorMsg}`,
      );
      await updateTxInHistory(item.txId, {
        status: "failed",
        error: errorMsg,
        completedAt: Date.now(),
      });
      results.push({ txId: item.txId, success: false, error: errorMsg });
      // Skip remaining broadcasts: their nonces depend on this one landing,
      // and submitting them now would just create more stuck txs. Mark them
      // as failed so the activity feed reflects reality.
      for (let j = i + 1; j < prepared.length; j++) {
        const skipped = prepared[j];
        await updateTxInHistory(skipped.txId, {
          status: "failed",
          error: `Skipped — earlier deposit (${i + 1}/${prepared.length}) failed`,
          completedAt: Date.now(),
        });
        results.push({
          txId: skipped.txId,
          success: false,
          error: `Skipped — earlier deposit failed`,
        });
      }
      break;
    }
  }

  const successfulResults = results.filter((r) => r.success && r.l1TxHash);
  const allFailed = successfulResults.length === 0;

  const { updateBundleStatus } = await import("./bundleStatusStorage");
  const { BUNDLE_STATUS } = await import("./erc5792Types");
  const { writeResultToStorage, showNotification } = await import("./txHandlers");

  if (allFailed) {
    const firstError = results.find((r) => r.error)?.error || "All L1 deposits failed";
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      error: firstError,
      completedAt: Date.now(),
    });
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Force Inclusion Failed",
      `All ${calls.length} L1 deposits failed: ${firstError}`,
    );
    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: false,
      error: firstError,
    });
    return;
  }

  // At least some deposits were broadcast
  const txHashes = successfulResults.map((r) => r.l1TxHash!);
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

  if (successfulResults.length < results.length) {
    const failedCount = results.filter((r) => !r.success).length;
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Failed",
      `${failedCount}/${calls.length} L1 deposits failed to broadcast`,
    );
  }

  // Phase 4: Wait for L1 receipts and start L2 tracking
  const { startReceiptPolling } = await import("./txReceiptPoller");

  await Promise.all(successfulResults.map(async (item) => {
    try {
      const receipt = await l1PublicClient.waitForTransactionReceipt({
        hash: item.l1TxHash! as Hash,
        timeout: L1_RECEIPT_TIMEOUT,
      });

      // Critical: L1 tx may have reverted. Reverted txs emit no logs, so
      // extractL2Hash would silently return undefined and we'd wrongly mark
      // the tx as "L1 Confirmed / L2 Pending" — stuck forever.
      if (receipt.status === "reverted") {
        await updateTxInHistory(item.txId, {
          status: "failed",
          error: "L1 deposit transaction reverted onchain",
          completedAt: Date.now(),
          forceInclusionMeta: {
            l1TxHash: item.l1TxHash!,
            l1ChainId,
            l2ChainId: pending.chainId,
            l2Confirmed: false,
          },
        });
        // CONTRACT: this mutation must propagate back into the outer `results`
        // array. It works because Array.filter (used to derive successfulResults
        // from results above) shares object identity — `item` here is literally
        // the same object that lives in `results`. If you ever refactor that
        // filter to clone (e.g., `.filter(...).map(r => ({...r}))`), you'll
        // break two invariants:
        //   1. `lastSuccessful` (computed in trackBatchForceInclusionCompletion)
        //      will pick a reverted sub-tx as the bundle's primary txHash
        //   2. The aggregate bundle status will count this sub-tx as confirmed
        item.success = false;
        return;
      }

      const l2Hash = extractL2Hash(receipt);
      const resultHash = l2Hash || item.l1TxHash!;

      await updateTxInHistory(item.txId, {
        status: "pending",
        txHash: resultHash,
        forceInclusionMeta: {
          l1TxHash: item.l1TxHash!,
          l1ChainId,
          l2ChainId: pending.chainId,
          l2Confirmed: false,
        },
      });

      // Start L2 receipt polling once we have the L2 hash
      if (l2Hash) {
        startReceiptPolling(item.txId, l2Hash, pending.chainId);
      }
    } catch {
      await updateTxInHistory(item.txId, {
        status: "failed",
        error: "L1 receipt timeout",
        completedAt: Date.now(),
      });
      // Same shared-reference contract as the revert path above — mark this
      // sub-tx as failed so lastSuccessful and the aggregate status are correct.
      item.success = false;
    }
  }));

  // Phase 5: Track aggregate bundle completion (poll local storage, zero RPC)
  trackBatchForceInclusionCompletion(bundleId, pending.chainName, results);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handleBatchForceInclusionFailure(
  bundleId: string,
  pending: PendingBatchTxRequest,
  error: string,
): Promise<void> {
  const { updateBundleStatus } = await import("./bundleStatusStorage");
  const { BUNDLE_STATUS } = await import("./erc5792Types");
  const { showNotification, writeResultToStorage } = await import("./txHandlers");

  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error,
    completedAt: Date.now(),
  });

  await updateTxInHistory(bundleId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });

  await showNotification(
    `tx-failed-${bundleId}`,
    "Batch Force Inclusion Failed",
    error.length > 100 ? error.substring(0, 100) + "..." : error,
  );

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error,
  });
}

/**
 * Polls local tx history (zero RPC) until all sub-txs in a force-inclusion
 * batch resolve, then writes the aggregate bundle status. Exported because
 * recoverStuckForceInclusionTxs() needs to re-launch this on service worker
 * restart for bundles whose tracker died mid-loop.
 */
export async function trackBatchForceInclusionCompletion(
  bundleId: string,
  chainName: string,
  results: Array<{ txId: string; success: boolean; l1TxHash?: string; error?: string }>,
): Promise<void> {
  const { getTxById } = await import("./txHistoryStorage");
  const { updateBundleStatus } = await import("./bundleStatusStorage");
  const { BUNDLE_STATUS } = await import("./erc5792Types");
  const { showNotification } = await import("./txHandlers");

  const successfulTxIds = results.filter((r) => r.success).map((r) => r.txId);
  if (successfulTxIds.length === 0) return;

  // L1 confirm (~12s) + L2 sequencer inclusion (~1-10 min) = longer timeout
  const MAX_WAIT_MS = 15 * 60 * 1000;
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let allResolved = true;
    for (const txId of successfulTxIds) {
      const tx = await getTxById(txId);
      if (!tx || tx.status === "processing" || tx.status === "pending") {
        allResolved = false;
        break;
      }
    }

    if (allResolved) break;
  }

  // Compute aggregate status
  let successCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (!r.success) {
      failCount++;
      continue;
    }
    const tx = await getTxById(r.txId);
    if (tx?.status === "success") {
      successCount++;
    } else {
      failCount++;
    }
  }

  let aggregateStatus: number;
  if (successCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.CONFIRMED;
  } else if (failCount === results.length) {
    aggregateStatus = BUNDLE_STATUS.REVERTED;
  } else {
    aggregateStatus = BUNDLE_STATUS.PARTIAL_REVERT;
  }

  const lastSuccessful = [...results].reverse().find((r) => r.success && r.l1TxHash);
  await updateBundleStatus(bundleId, {
    status: aggregateStatus,
    txHash: lastSuccessful?.l1TxHash,
    completedAt: Date.now(),
  });

  if (aggregateStatus === BUNDLE_STATUS.CONFIRMED) {
    await showNotification(
      `tx-success-${bundleId}`,
      "Batch Force Inclusion Complete",
      `All ${results.length} calls on ${chainName} confirmed via L1 deposit.`,
    );
  } else if (aggregateStatus === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Confirmed",
      `${successCount}/${results.length} calls confirmed on ${chainName}. ${failCount} failed.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Force Inclusion Failed",
      `All calls on ${chainName} failed.`,
    );
  }
}
