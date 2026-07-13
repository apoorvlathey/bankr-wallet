/**
 * ERC-5792 batch transaction handlers
 * Manages wallet_getCapabilities, wallet_sendCalls, wallet_getCallsStatus, wallet_showCallsStatus
 */

import {
  submitTransactionDirect,
  type TransactionParams,
} from "./bankrApi";
import {
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
} from "../constants/networks";
import { ALLOWED_CHAIN_IDS } from "../constants/chainRegistry";
import {
  resolveActiveDelegate,
  hasDefaultDelegateForChain,
} from "../utils/delegationResolution";
import { getAllDelegatesForAccount } from "./delegationStorage";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import {
  getActiveAccount,
  getAccountById,
} from "./accountStorage";
import type { Account } from "./types";
import { removePendingBatchTxRequest, getPendingBatchTxRequestById } from "./pendingBatchTxStorage";
import {
  updateBundleStatus,
} from "./bundleStatusStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  setCachedVault,
  getAutoLockTimeout,
  tryRestoreSession,
  getPrivateKeyFromCache,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import {
  addTxToHistory,
  updateTxInHistory,
  getTxById,
} from "./txHistoryStorage";
import { attachClearSignedMetaToHistory } from "./clearSignedMetaSnapshot";
import { startReceiptPolling, applyReceiptToHistory } from "./forceInclusion/receiptPoller";
import {
  extractAssetChangesWhenReceiptAvailable,
  fetchBundleReceipt,
  fetchRawTransactionReceipt,
  toBundleReceipt,
} from "./receiptEnrichment";
import { writeResultToStorage, showNotification, getRpcUrl } from "./txHandlers";
import {
  signAndBroadcastTransaction,
  isBroadcastOutcomeUncertain,
} from "./localSigner";
import { getNextNonce, resetNonce } from "./forceInclusion/nonceManager";
import { decryptAllKeys } from "./vaultCrypto";
import { hasEncryptedApiKey } from "./crypto";
import {
  getStoredResolvedChainById,
  getStoredNetworksInfo,
  getResolvedChains,
} from "../lib/chains";
import type {
  ERC5792Call,
  PendingBatchTxRequest,
  BundleReceipt,
} from "./erc5792Types";
import { BUNDLE_STATUS, ERC5792_ERRORS } from "./erc5792Types";
import { OP_STACK_CHAIN_IDS } from "../constants/networks";
import { fetchRpcResult } from "./rpcHttpClient";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
} from "./pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "./pendingRequestResolution";
import { authorizePendingBankrSubmit } from "./bankrPendingAuthorization";
import {
  BATCH_TX_EXPIRY_MS,
  processingBundleIds,
} from "./batch/batchExecutionRuntime";
import { confirmLocalBatchWithExecutors } from "./batch/batchLocalConfirmation";
import { handleBatchFailure } from "./batch/batchFailure";
import { processSequentialLocalBatch } from "./batch/batchSequentialExecution";
import { processAtomic7702LocalBatch } from "./batch/batchAtomic7702Execution";
// Compatibility exports: callers keep importing the established facade while
// the pure encoding policy remains independently auditable.
export { encodeBatchCalls, omitOuterValueForEip7702 } from "./batch/batchTxEncoding";
export { handleWalletSendCalls } from "./batch/batchRequestIntake";
export { handleConfirmBatchTransaction } from "./batch/batchBankrExecution";
export {
  handleRejectBatchTransaction,
  handleRemoveCallFromPendingBatch,
  handleUpdateCallInPendingBatch,
  handleWalletGetCallsStatus,
  handleWalletShowCallsStatus,
} from "./batch/batchRequestStatusHandlers";

// ---------------------------------------------------------------------------
// ERC-7821 batch encoding
// ---------------------------------------------------------------------------

async function authorizePendingLocalBatchBroadcast(
  pending: PendingBatchTxRequest,
  expectedAccount: { id: string; address: string; type: string },
  beginEffect: () => void,
): Promise<void> {
  // Re-resolve the pinned account before the final transport check. The
  // lifecycle authorization must be the last await so an origin revoke or WC
  // disconnect cannot interleave between that decision and beginEffect().
  const latestAccount = await getAccountById(expectedAccount.id);
  if (
    !latestAccount ||
    latestAccount.type !== expectedAccount.type ||
    latestAccount.address.toLowerCase() !==
      expectedAccount.address.toLowerCase()
  ) {
    throw new Error("Pending request account is no longer available");
  }
  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
  if (!authorization.authorized) {
    throw new Error(authorization.error);
  }
  beginEffect();
}

// ---------------------------------------------------------------------------
// Prevent double-execution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// wallet_getCapabilities
// ---------------------------------------------------------------------------

export async function handleWalletGetCapabilities(
  address: string,
  chainIds?: `0x${string}`[],
  accountOverride?: Account,
): Promise<Record<string, any>> {
  const account = accountOverride ?? await getActiveAccount();

  // Per ERC-5792, capabilities are scoped to the *connected* address. We have
  // a single active account at a time, so a dapp asking about any other
  // address must get back an empty response — otherwise the dapp would think
  // we can sign atomic batches for arbitrary EOAs (e.g. someone else's
  // address pasted as a probe).
  if (address && account?.address) {
    if (address.toLowerCase() !== account.address.toLowerCase()) {
      return {};
    }
  }

  const isBankrAccount = account?.type === "bankr";
  const isPKOrSP =
    account?.type === "privateKey" || account?.type === "seedPhrase";
  // Impersonators advertise batching so wagmi dapps surface the batched flow,
  // but the popup will show a view-only banner and hide the Confirm button.
  // Confirm-time signing is still defended at handleConfirmBatchTransaction
  // and resolvePinnedAccount.
  const isImpersonator = account?.type === "impersonator";

  const capabilities: Record<string, any> = {};

  // The current ERC-5792 spec exposes batch support via
  // `atomic: { status: "supported" | "ready" | "unsupported" }`. The legacy
  // shape was `atomicBatch: { supported: boolean }` — some dapps and the
  // older wagmi / @wagmi/connectors versions still look for that, so we
  // advertise both. Keeping them in lockstep here (single helper) ensures
  // every emit site stays consistent if either spec moves.
  const ATOMIC_SUPPORTED_CAP = {
    atomic: { status: "supported" },
    atomicBatch: { supported: true },
  } as const;

  // Build a hidden-chain filter from the user's networks store. Honoring
  // `hidden` here keeps the dapp-visible support set in lockstep with what
  // shows up in the in-wallet UI — if the user hid a chain in Networks,
  // dapps shouldn't see capabilities for it either.
  const networksInfo = await getStoredNetworksInfo();
  const hiddenChainIds = new Set<number>();
  for (const c of getResolvedChains(networksInfo)) {
    if (c.hidden) hiddenChainIds.add(c.chainId);
  }
  const shouldEmit = (chainId: number, hexChainId: `0x${string}`) => {
    if (hiddenChainIds.has(chainId)) return false;
    if (chainIds && chainIds.length > 0 && !chainIds.includes(hexChainId)) {
      return false;
    }
    return true;
  };

  // Bankr accounts: atomic batching on Bankr-supported chains
  if (isBankrAccount) {
    for (const chainId of BANKR_SUPPORTED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  // PK/SP accounts: only advertise `atomic` for chains where the same resolver
  // used at confirm time can find a usable delegate. This keeps capabilities
  // honest for edge cases such as an EOA already delegated to a non-ERC-7821
  // contract. Built-in Pectra chains, including non-standard-gas chains like
  // MegaETH, qualify through the default delegate when no conflicting onchain
  // delegation exists. Custom chains whose chainId is in KNOWN_CHAINS also
  // qualify through the default delegate once the user has added the chain.
  //
  // Candidate set = built-ins ∪ visible custom chains with a known default
  // delegate deployment ∪ chains where this account has a stored custom
  // delegate. We deliberately do NOT include every chain in `networksInfo` —
  // a user with 20 random custom chains would otherwise trigger 20 RPC probes
  // per `wallet_getCapabilities` call, and dead RPCs would stall the response.
  // KNOWN_CHAINS custom networks are the safe exception because the resolver
  // can authorize WalletChan's default delegate without manual setup.
  if (isPKOrSP && account) {
    const candidateSet = new Set<number>(ALLOWED_CHAIN_IDS);
    for (const c of getResolvedChains(networksInfo)) {
      if (!c.hidden && hasDefaultDelegateForChain(c.chainId)) {
        candidateSet.add(c.chainId);
      }
    }
    const optedInDelegates = await getAllDelegatesForAccount(account.id);
    for (const chainIdStr of Object.keys(optedInDelegates)) {
      const chainId = Number(chainIdStr);
      if (Number.isFinite(chainId)) candidateSet.add(chainId);
    }

    const candidateChainIds: number[] = [];
    for (const chainId of candidateSet) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      candidateChainIds.push(chainId);
    }

    // Parallel resolver probes. Each call hits chrome.storage and at most two RPCs
    // (eth_getCode + supportsExecutionMode), so a small fan-out is fine —
    // dapps frequently call wallet_getCapabilities without a chainIds filter.
    const probeResults = await Promise.all(
      candidateChainIds.map(async (chainId) => {
        const resolved = await getStoredResolvedChainById(chainId);
        if (!resolved?.rpcUrl) return { chainId, atomic: false };
        try {
          const result = await resolveActiveDelegate({
            accountId: account.id,
            accountAddress: account.address as `0x${string}`,
            chainId,
            rpcUrl: resolved.rpcUrl,
          });
          return { chainId, atomic: !!result.delegate };
        } catch {
          return { chainId, atomic: false };
        }
      }),
    );

    for (const { chainId, atomic } of probeResults) {
      if (!atomic) continue;
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  // Impersonator accounts advertise on every allowed chain so dapps surface
  // their batched flow — the popup will show the calls in view-only mode
  // (banner + disabled Confirm in BatchTransactionConfirmation.tsx). No
  // signing happens, so the "atomic" claim is moot; the goal is to let the
  // user inspect what a dapp tried to send. Non-standard-gas chains like
  // MegaETH stay included here — the gas-estimation caveat that gates real
  // signing paths doesn't apply when nothing is ever signed.
  if (isImpersonator) {
    for (const chainId of ALLOWED_CHAIN_IDS) {
      const hexChainId = `0x${chainId.toString(16)}` as `0x${string}`;
      if (!shouldEmit(chainId, hexChainId)) continue;
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }

  return capabilities;
}

// ---------------------------------------------------------------------------
// wallet_sendCalls
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Confirm batch transaction (Bankr API path)
// ---------------------------------------------------------------------------

export async function handleConfirmBatchTransactionPK(
  bundleId: string,
  password: string,
  _tabId?: number,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  return confirmLocalBatchWithExecutors(
    {
      processSingle: processBatchAsSingleTxInBackground,
      processNonAtomic: processBatchTransactionNonAtomicInBackground,
      processAtomic7702: processBatchTransactionAtomic7702InBackground,
    },
    bundleId,
    password,
    _tabId,
    functionNames,
    precomputedGasEstimates,
    forceInclusion,
  );
}
async function processBatchTransactionNonAtomicInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: any,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
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
async function trackNonAtomicBundleCompletion(
  bundleId: string,
  pending: PendingBatchTxRequest,
  results: Array<{ txId: string; success: boolean; txHash?: string; error?: string }>,
): Promise<void> {
  const successfulTxIds = results.filter((r) => r.success).map((r) => r.txId);
  if (successfulTxIds.length === 0) return;

  // Poll local storage (no RPC) until all txs have a terminal status.
  // startReceiptPolling() handles the actual RPC calls with exponential backoff.
  const MAX_WAIT_MS = 10 * 60 * 1000; // 10 min (match receipt poller timeout)
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

  // Read final statuses and fetch receipts for bundle status (one-time, not polling)
  const receipts: BundleReceipt[] = [];
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
      if (r.txHash) {
        const receipt = await fetchBundleReceipt(r.txHash, pending.chainId);
        if (receipt) receipts.push(receipt);
      }
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

  // Set txHash to the last successful tx (the meaningful action, e.g., swap after approve)
  const lastSuccessfulTx = [...results].reverse().find((r) => r.success && r.txHash);
  await updateBundleStatus(bundleId, {
    status: aggregateStatus,
    txHash: lastSuccessfulTx?.txHash,
    // Reverse receipts so the last/most-meaningful tx (e.g., swap) comes first.
    // Dapps like LlamaSwap use `receipts.find(r => ...)` which picks the first match.
    receipts: receipts.length > 0 ? receipts.reverse() : undefined,
    completedAt: Date.now(),
  });

  // Notification for final status
  const chainConfig = CHAIN_CONFIG[pending.chainId];
  if (aggregateStatus === BUNDLE_STATUS.CONFIRMED) {
    const notificationId = `tx-success-${bundleId}`;
    const lastTxHash = lastSuccessfulTx?.txHash || results[0]?.txHash;
    const explorerUrl = chainConfig?.explorer && lastTxHash
      ? `${chainConfig.explorer}/tx/${lastTxHash}`
      : null;
    if (explorerUrl) {
      chrome.storage.local.set({ [`notification-${notificationId}`]: explorerUrl });
    }
    await showNotification(
      notificationId,
      "Batch Transaction Confirmed",
      `All ${results.length} calls on ${pending.chainName} confirmed successfully.`,
    );
  } else if (aggregateStatus === BUNDLE_STATUS.PARTIAL_REVERT) {
    await showNotification(
      `tx-partial-${bundleId}`,
      "Batch Partially Reverted",
      `${successCount}/${results.length} calls succeeded on ${pending.chainName}. ${failCount} reverted.`,
    );
  } else {
    await showNotification(
      `tx-failed-${bundleId}`,
      "Batch Transaction Reverted",
      `All calls on ${pending.chainName} reverted.`,
    );
  }
}

/**
 * Track the receipt for a PK/SP atomic (or single-call) bundle and update the
 * bundle status when terminal so the dapp's `wallet_getCallsStatus` polling
 * sees CONFIRMED / REVERTED. `applyReceiptToHistory` only updates the tx
 * history row; the bundle status is a separate storage key the dapp reads.
 *
 * For Bankr atomic batches the Bankr API returns the receipt synchronously,
 * so the bundle status is set inline. PK/SP atomic broadcasts return only a
 * tx hash, so we poll local tx history (no RPC) waiting for the receipt
 * poller (`startReceiptPolling`) to land a terminal status, then mirror that
 * to the bundle status.
 */
async function trackAtomicBundleCompletion(
  bundleId: string,
  txHash: string,
  pending: PendingBatchTxRequest,
): Promise<void> {
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const tx = await getTxById(bundleId);
    if (!tx || tx.status === "processing" || tx.status === "pending") continue;

    if (tx.status === "success") {
      const receipt = await fetchBundleReceipt(txHash, pending.chainId);
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const notificationId = `tx-success-${bundleId}`;
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }
      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch (${pending.params.calls.length} call${pending.params.calls.length === 1 ? "" : "s"}) on ${pending.chainName} was successful.`,
      );
    } else {
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        error: tx.error || "Transaction reverted",
        completedAt: Date.now(),
      });

      await showNotification(
        `tx-failed-${bundleId}`,
        "Batch Transaction Reverted",
        `Batch on ${pending.chainName} reverted onchain.`,
      );
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// PK/SP single-call shortcut: a batch with calls.length === 1 ships as a
// plain EIP-1559 tx, no ERC-7821 self-call wrapping, no 7702 overhead. The
// dapp gets the same wallet_sendCalls success ack with a single tx hash.
// ---------------------------------------------------------------------------

async function processBatchAsSingleTxInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const { calls } = pending.params;
  const call = calls[0];
  const chainId = pending.chainId;
  const fromAddr = account.address;
  const displayName =
    functionNames?.[0] || `Batch (${pending.params.calls.length} call)`;
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
    functionName: displayName,
  });
  attachClearSignedMetaToHistory(
    bundleId,
    { to: call.to, data: call.data, value: call.value },
    chainId,
  );

    const nonce = await getNextNonce(fromAddr, chainId);
    const est = precomputedGasEstimates?.[0];
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
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId,
        nonce,
        gas: est?.gasLimit || "500000",
        maxFeePerGas: est?.maxFeePerGas || undefined,
        maxPriorityFeePerGas: est?.maxPriorityFeePerGas || undefined,
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
      // The receipt poller updates tx history but not bundle status. Watch
      // history until terminal and mirror to the bundle status so the dapp's
      // wallet_getCallsStatus polling resolves.
      void trackAtomicBundleCompletion(bundleId, result.txHash, pending);
    }

    fetchAndStoreBatchGasData(bundleId, result.txHash, chainId);

    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: result.txHash,
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
// EIP-7702 atomic batch (PK/SP, calls.length > 1).
//
// Uses ERC-7821 batch encoding against the EOA itself. If the EOA isn't
// already delegated to a 7821-compatible contract, an authorization tuple
// is bundled into the tx (type-4 / EIP-7702) so the EOA's `code` is set
// to point at `delegate` for this execution. After inclusion, subsequent
// batches reuse the same delegation onchain (no further auth needed).
// ---------------------------------------------------------------------------

/**
 * Optional metadata for callers that re-use the atomic-7702 broadcast path
 * for non-dapp flows (e.g., the swap surface — see `handleExecuteSwapAtomicPK`
 * in `txHandlers.ts`). When set, these get attached to the bundle's tx-history
 * row so the activity modal, asset-changes extractor, and bridge-status poller
 * all recognise the entry the same way they do for Bankr-atomic swap/bridge
 * txs. Pure pass-through — no behaviour change for dapp-initiated batches
 * (their callers leave this undefined).
 */
export type { AtomicBatchHistoryMeta } from "./batch/batchAtomic7702Execution";

export async function processBatchTransactionAtomic7702InBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  account: { id: string; address: string; type: string },
  privateKey: `0x${string}`,
  delegate: `0x${string}`,
  needsAuthorization: boolean,
  functionNames?: string[],
  precomputedGasEstimates?: import("./gasEstimation").GasEstimate[],
  historyMeta?: import("./batch/batchAtomic7702Execution").AtomicBatchHistoryMeta,
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
// Helpers
// ---------------------------------------------------------------------------

async function fetchAndStoreBatchGasData(
  bundleId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return;

  try {
    const rpcCall = (method: string, params: any[]) =>
      fetchRpcResult(rpcUrl!, method, params, {
        allowPrivateWithoutOrigin: true,
      });

    const [txData, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return;

    const gasData: import("./txHistoryStorage").GasData = {
      gasUsed: BigInt(receipt.gasUsed).toString(),
      gasLimit: txData?.gas
        ? BigInt(txData.gas).toString()
        : BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    };

    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed)
        gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      if (receipt.l1GasPrice)
        gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }

    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical
  }
}
