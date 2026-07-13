/**
 * Transaction and signature request handlers
 * Manages pending transactions, signature requests, and their lifecycle
 */

import { loadDecryptedApiKey, hasEncryptedApiKey } from "./crypto";
import {
  submitTransactionDirect,
  TransactionParams,
  BankrApiError,
} from "./bankrApi";
import {
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_NAMES,
} from "../constants/networks";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getStoredResolvedChainById } from "@/lib/chains";
import type { Account } from "./types";
import { getAccountById } from "./accountStorage";
import {
  signAndBroadcastTransaction,
  isBroadcastOutcomeUncertain,
} from "./localSigner";
import { assertLocalAccountEffectBinding } from "./localAccountEffectBoundary";
import {
  removePendingTxRequest,
  getPendingTxRequestById,
  PendingTxRequest,
  PinnedTxRequest,
} from "./pendingTxStorage";
import { pinnedTxRequest } from "./pinnedRequest";
import {
  addTxToHistory,
  updateTxInHistory,
  getTxById,
  type SwapMeta,
} from "./txHistoryStorage";
import { attachClearSignedMetaToHistory } from "./clearSignedMetaSnapshot";
import {
  getCachedApiKey,
  setCachedApiKey,
  setCachedVault,
  getPrivateKeyFromCache,
  getCachedPassword,
  getCachedVaultKey,
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { handleUnlockWallet } from "./authHandlers";
import {
  activeAbortControllers,
  processingTxIds,
  resolvePinnedAccount,
  TX_EXPIRY_MS,
  writeResultToStorage,
  type FailedTxResult,
  type TransactionResult,
} from "./transactions/runtime";
import { startReceiptPolling, applyReceiptToHistory } from "./forceInclusion/receiptPoller";
import { extractAssetChangesWhenReceiptAvailable } from "./receiptEnrichment";
import { getNextNonce, resetNonce } from "./forceInclusion/nonceManager";
import { enforcePendingRequestAuthorizationAtConfirmation } from "./pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "./pendingRequestResolution";
import { authorizePendingBankrSubmit } from "./bankrPendingAuthorization";
import { bindPendingBankrCredential } from "./bankrCredentialBinding";
import { getRpcUrl } from "./transactions/rpcConfig";
import { showNotification } from "./transactions/notification";
import {
  fetchAndStoreGasData,
  lookupFunctionName,
} from "./transactions/displayMetadata";
import { handleTransactionFailure } from "./transactions/failure";
import type { GasOverrides } from "./transactions/localExecution";

export {
  activeAbortControllers,
  failedTxResults,
  resolvePinnedAccount,
  writeResultToStorage,
  type FailedTxResult,
  type SignatureResult,
  type TransactionResult,
} from "./transactions/runtime";
export {
  handleSignatureRequest,
  handleTransactionRequest,
} from "./transactions/requestIntake";
export { openExtensionPopup, openPopupWindow } from "./extensionPopup";
export {
  handleAddPrivateKeyAccount,
  handleRemoveAccount,
} from "./transactions/accountMutations";
export { performSecurityReset } from "./transactions/securityReset";
export { handleInitiateTransfer } from "./transactions/internalTransfer";
export { getRpcUrl } from "./transactions/rpcConfig";
export { showNotification } from "./transactions/notification";
export type { GasOverrides } from "./transactions/localExecution";
export { handleConfirmTransactionAsyncPK } from "./transactions/localConfirmation";
export {
  handleConfirmSignatureRequest,
  handleConfirmSignatureRequestBankr,
} from "./signatures/confirmationHandlers";

export async function handleConfirmTransaction(
  txId: string,
  password: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingTxRequest(txId);
    return { success: false, error: "Transaction request expired" };
  }

  // SECURITY: resolve the account pinned at request arrival; reject if the
  // binding is stale or the account is gone.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  // SECURITY: this handler signs via the Bankr API.
  if (pinned.account.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  // Try to use cached API key first
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    // Try session restoration if cache is empty and auto-lock is "Never"
    if (!getCachedPassword()) {
      const { getAutoLockTimeout } = await import("./sessionCache");
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { tryRestoreSession } = await import("./sessionCache");
        const { handleUnlockWallet } = await import("./authHandlers");
        await tryRestoreSession(handleUnlockWallet);
        // Check if API key was restored
        apiKey = getCachedApiKey();
      }
    }

    // If still no cached API key, try to decrypt with provided password
    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      // Cache the API key and password for future transactions
      setCachedApiKey(apiKey, password);
    }
  }

  // Commit the prompt before invoking the remote signer. From this point the
  // API may have accepted/broadcast the transaction even if the response is
  // interrupted, so retaining a retryable pending request could double-send.
  // Authentication and all safe validation failures above intentionally leave
  // it pending.
  await removePendingTxRequest(txId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
  if (!authorization.authorized) {
    return { success: false, error: authorization.error };
  }

  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  // Create AbortController for this transaction
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();

    if (result.status === "reverted") {
      return { success: false, error: "Transaction reverted" };
    }

    return { success: true, txHash: result.transactionHash };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error:
          "Transaction submission was interrupted. Its outcome is unknown; check activity before retrying.",
      };
    }
    if (error instanceof BankrApiError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
  }
}

/**
 * Handles rejection from the popup. Looks up the pending request before
 * removing it so we can detect split-bundle membership and advance the
 * sequencer (mark the bundle stopped at this index). A missing request is not
 * rewritten: it may already have been confirmed by another extension surface,
 * and writing rejection then would overwrite that terminal result.
 */
export async function handleRejectTransaction(
  txId: string,
): Promise<TransactionResult> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) {
    return { success: false, error: "Transaction request not found" };
  }
  await removePendingTxRequest(txId);
  await writeResultToStorage(`txResult:${txId}`, {
    success: false,
    error: "Transaction rejected by user",
  });
  if (pending?.parentBundleId && pending.bundleIndex !== undefined) {
    const { advanceSplitBundle } = await import("./forceInclusion/splitBatchSequencer");
    await advanceSplitBundle({
      bundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      outcome: "rejected",
    });
  }
  return { success: false, error: "Transaction rejected by user" };
}

/**
 * Handles cancellation of an in-progress transaction
 */
export async function handleCancelTransaction(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const abortController = activeAbortControllers.get(txId);

  if (!abortController) {
    return { success: false, error: "No active transaction to cancel" };
  }

  abortController.abort();
  activeAbortControllers.delete(txId);

  return { success: true };
}

/**
 * Handles async confirmation - returns immediately and polls in background
 */
export async function handleConfirmTransactionAsync(
  txId: string,
  password: string,
  functionName?: string,
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  // Prevent double-execution
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending || Date.now() - pending.timestamp > TX_EXPIRY_MS) {
    if (pending) await removePendingTxRequest(txId);
    return { success: false, error: "Transaction request expired" };
  }

  // SECURITY: resolve the pinned account; reject stale/missing/impersonator
  // bindings. Do NOT fall back to getActiveAccount() — that re-introduces the
  // confirm-time-account-switch attack.
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }
  // SECURITY: this handler signs via the Bankr API. Refuse if the pinned
  // account is not a Bankr account (the live active account may be Bankr now,
  // but signing through the API would not match the pinned address).
  if (pinned.account.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  // Validate chain is supported for Bankr API accounts.
  // For force inclusion, the actual L1 deposit goes to the L1 chain — verify
  // THAT chain is in the Bankr-supported set (currently mainnet only).
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import("@/constants/chainRegistry");
    const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
    if (!info) {
      return { success: false, error: "Chain does not support force inclusion" };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        success: false,
        error: `Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.`,
      };
    }
  } else if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.tx.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.tx.chainId] || pending.tx.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingTxIds.add(txId);

  // Try to use cached API key first
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    // Try session restoration if cache is empty and auto-lock is "Never"
    if (!getCachedPassword()) {
      const { getAutoLockTimeout } = await import("./sessionCache");
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const { tryRestoreSession } = await import("./sessionCache");
        const { handleUnlockWallet } = await import("./authHandlers");
        await tryRestoreSession(handleUnlockWallet);
        // Check if API key was restored
        apiKey = getCachedApiKey();
      }
    }

    // If still no cached API key, try to decrypt with provided password
    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingTxIds.delete(txId);
        return { success: false, error: "Invalid password" };
      }
      // Cache the API key and password for future transactions
      setCachedApiKey(apiKey, password);
    }
  }

  const forceInclusionProcessor = forceInclusion
    ? (await import("./forceInclusion/single")).processForceInclusionBankr
    : null;

  // Remove from pending storage immediately
  await removePendingTxRequest(txId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
  if (!authorization.authorized) {
    processingTxIds.delete(txId);
    return { success: false, error: authorization.error };
  }

  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    processingTxIds.delete(txId);
    return { success: false, error: "Wallet reset is in progress" };
  }

  // Start background processing (cleanup of processingTxIds happens in finally block)
  if (forceInclusionProcessor) {
    forceInclusionProcessor(txId, pending, apiKey, effectLease);
  } else {
    processTransactionInBackground(
      txId,
      pending,
      apiKey,
      functionName,
      effectLease,
    );
  }

  return { success: true };
}

/**
 * Processes transaction in background and shows notification on completion
 */
async function processTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  functionName?: string,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  // Create AbortController for this transaction
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
  // Save to history as "processing" immediately
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.tx.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName,
  });

  // If no function name provided by UI, try background lookup
  if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
    lookupFunctionName(pending.tx.data).then((name) => {
      if (name) updateTxInHistory(txId, { functionName: name });
    });
  }

  // Snapshot clear-signed summary so the Activity tab can render
  // "Approved 100 USDC to Uniswap V3 Router" without re-fetching at render
  // time. Fire-and-forget so a slow eth.sh / ENS lookup doesn't delay submit.
  attachClearSignedMetaToHistory(
    txId,
    { ...pending.tx, to: pending.tx.to ?? undefined },
    pending.tx.chainId,
  );

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "transaction",
        pending,
      );
    if (!authorization.authorized) {
      throw new Error(authorization.error);
    }

    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      await handleTransactionFailure(
        txId,
        pending,
        "Transaction reverted",
      );
    } else if (result.status === "success" && txHash) {
      // API confirmed onchain (waitForConfirmation: true) — mark success
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId,
        txHash,
        chainId: pending.tx.chainId,
        userAddress: pending.tx.from,
        logPrefix: "[bankr]",
      });

      // Fire-and-forget gas fee fetch
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
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
        "Transaction Confirmed",
        `Transaction on ${pending.chainName} was successful. Click to view.`,
      );

      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
    } else {
      // API returned "pending" — tx submitted but not yet confirmed
      await updateTxInHistory(txId, {
        status: "pending",
        txHash,
      });

      // Start polling for onchain confirmation
      if (txHash) {
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }

      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
    }
  } catch (error) {
    let errorMessage = "Unknown error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage =
          "Transaction submission was interrupted. Its outcome is unknown; check activity before retrying.";
      } else {
        errorMessage = error.message;
      }
    }

    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}

// ---------------------------------------------------------------------------
// Direct Swap Execution (bypasses confirmation screen)
// ---------------------------------------------------------------------------

export interface SwapTxEntry {
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  functionName?: string;
  swapMeta?: SwapMeta;
  /**
   * Cross-chain bridge metadata. When present, this entry represents the
   * bridge call itself (not an approval) and the post-success path will
   * start polling Bungee's `/status` for destination-leg completion.
   *
   * For PK/Seed sequential broadcasts of `[approve, bridge]`, set `bridge`
   * only on the LAST entry. For Bankr atomic batches, set it once on the
   * combined batch tx (the handler collects it from the matching original
   * entry).
   */
  bridge?: import("./txHistoryStorage").BridgeMeta;
}

export interface SwapAccountLock {
  accountId?: string;
  fromAddress?: string;
}

async function resolveLockedSwapAccount(
  lock: SwapAccountLock | undefined,
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  if (!lock?.accountId || !lock.fromAddress) {
    return { ok: false, error: "Prepared swap is missing its account lock" };
  }

  const account = await getAccountById(lock.accountId);
  if (!account) {
    return { ok: false, error: "Account no longer exists" };
  }

  const lockedFrom = lock.fromAddress.toLowerCase();
  if (account.address.toLowerCase() !== lockedFrom) {
    return {
      ok: false,
      error: "Prepared swap account does not match the locked from address",
    };
  }

  if (account.type === "impersonator") {
    return { ok: false, error: "View-only accounts cannot execute swaps" };
  }

  return { ok: true, account };
}

function validateLockedSwapTransactions(
  transactions: SwapTxEntry[],
  fromAddress: string,
  expectedChainId?: number,
): { ok: true } | { ok: false; error: string } {
  const lockedFrom = fromAddress.toLowerCase();
  for (const entry of transactions) {
    if (entry.tx.from.toLowerCase() !== lockedFrom) {
      return {
        ok: false,
        error: "Prepared swap transaction does not match the locked from account",
      };
    }
    if (
      expectedChainId !== undefined &&
      entry.tx.chainId !== expectedChainId
    ) {
      return {
        ok: false,
        error: "Prepared swap transaction chain does not match the requested chain",
      };
    }
  }
  return { ok: true };
}

/**
 * Directly signs and broadcasts swap transactions (approval + swap) without
 * going through the TransactionConfirmation screen. Handles all wallet types.
 * Uses the nonce manager so approval + swap get sequential nonces.
 */
export async function handleExecuteSwapDirect(
  transactions: SwapTxEntry[],
  chainName: string,
  // Per-call gas overrides from the swap confirmation's tier picker. One
  // entry per `transactions[i]`. Optional for back-compat — Bankr accounts
  // and the legacy code paths still work without this.
  gasEstimates?: { gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string }[],
  accountLock?: SwapAccountLock,
): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  if (transactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const chainId = transactions[0].tx.chainId;
  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) {
    return { success: false, error: locked.error };
  }
  const validation = validateLockedSwapTransactions(
    transactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  // Validate chain is configured
  const swapRpc = await getRpcUrl(chainId);
  if (!swapRpc) {
    return { success: false, error: `Chain ${chainId} not configured` };
  }

  const account = locked.account;

  // SECURITY: impersonator accounts are view-only — block all swap execution.
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot execute swaps" };
  }

  // --- Bankr API accounts ---
  if (account.type === "bankr") {
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
      return { success: false, error: `Chain not supported for Bankr API accounts` };
    }

    let apiKey = getCachedApiKey();
    if (!apiKey) {
      if (!getCachedPassword()) {
        const autoLockTimeout = await getAutoLockTimeout();
        if (autoLockTimeout === 0) {
          await tryRestoreSession(handleUnlockWallet);
          apiKey = getCachedApiKey();
        }
      }
      if (!apiKey) {
        return { success: false, error: "Wallet must be unlocked" };
      }
    }

    const txIds: string[] = [];
    for (const entry of transactions) {
      const txId = crypto.randomUUID();
      txIds.push(txId);
      const pending = await bindPendingBankrCredential(pinnedTxRequest(account, {
        id: txId,
        tx: entry.tx,
        origin: entry.origin,
        favicon: entry.favicon,
        chainName,
        timestamp: Date.now(),
        trustedInternal: true,
      }));
      // Await each TX so approval is accepted before swap starts. A reverted,
      // failed, or ambiguous earlier leg must stop the tail; otherwise an old
      // allowance could let a later swap execute after its reviewed approval
      // failed.
      const leg = await processSwapTxBankr(
        txId,
        pending,
        apiKey,
        entry.functionName,
        entry.swapMeta,
        entry.bridge,
      );
      if (leg.kind !== "accepted") {
        const attemptedLegCount = txIds.length;
        const skippedError =
          leg.kind === "ambiguous"
            ? "Skipped because the previous Bankr submission outcome is unknown"
            : "Skipped because an earlier Bankr transaction failed";
        for (const skipped of transactions.slice(txIds.length)) {
          const skippedId = crypto.randomUUID();
          txIds.push(skippedId);
          const skippedPending = pinnedTxRequest(account, {
            id: skippedId,
            tx: skipped.tx,
            origin: skipped.origin,
            favicon: skipped.favicon,
            chainName,
            timestamp: Date.now(),
            trustedInternal: true,
          });
          await addTxToHistory({
            id: skippedId,
            status: "failed",
            tx: skippedPending.tx,
            origin: skippedPending.origin,
            favicon: skippedPending.favicon,
            chainName,
            chainId: skippedPending.tx.chainId,
            createdAt: skippedPending.timestamp,
            accountType: "bankr",
            functionName: skipped.functionName,
            swapMeta: skipped.swapMeta,
            bridge: skipped.bridge,
            error: skippedError,
            completedAt: Date.now(),
          });
        }
        return {
          success: leg.kind === "ambiguous" || attemptedLegCount > 1,
          txIds,
          error: leg.error,
        };
      }
    }
    return { success: true, txIds };
  }

  // --- PK / Seed Phrase accounts ---
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return { success: false, error: "Unsupported account type" };
  }

  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) privateKey = getPrivateKeyFromCache(account.id);
      }
    }
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        const vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
        if (vault) setCachedVault(vault);
      }
      privateKey = getPrivateKeyFromCache(account.id);
    }
    if (!privateKey) {
      return { success: false, error: "Wallet must be unlocked" };
    }
  }

  const resolvedChain = await getStoredResolvedChainById(chainId);
  const rpcUrl = resolvedChain?.rpcUrl;
  const customChainMeta = resolvedChain?.isCustom
    ? {
        name: resolvedChain.name,
        nativeCurrency: resolvedChain.nativeCurrency,
        explorer: resolvedChain.explorer || undefined,
      }
    : undefined;

  // Phase 1 (sequential): assign nonces + write history entries
  // This avoids the addTxToHistory race condition and ensures correct nonces.
  const prepared: Array<{
    txId: string;
    pending: PinnedTxRequest;
    nonce: number;
    functionName?: string;
    swapMeta?: SwapMeta;
  }> = [];

  const txIds: string[] = [];
  const fromAddr = transactions[0].tx.from;

  for (let i = 0; i < transactions.length; i++) {
    const entry = transactions[i];
    const txId = crypto.randomUUID();
    txIds.push(txId);

    const nonce = await getNextNonce(fromAddr, chainId);

    const pending = pinnedTxRequest(account, {
      id: txId,
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      timestamp: Date.now(),
    });

    // Persist the per-call gas overrides (when supplied) so the tx-detail
    // modal can show what was really broadcast rather than the dapp's
    // / quote's raw suggestion.
    const gasOverride = gasEstimates?.[i];
    const txForHistory = gasOverride
      ? {
          ...entry.tx,
          gas: gasOverride.gasLimit,
          maxFeePerGas: gasOverride.maxFeePerGas,
          maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : entry.tx;

    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: txForHistory,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName: entry.functionName,
      swapMeta: entry.swapMeta,
      bridge: entry.bridge,
    });

    // Snapshot the clear-signed summary ("Approved 500 USDC to SocketGateway")
    // for internal swap / bridge approve+swap txs too, so the Activity tab
    // and detail modal render the human-readable line instead of falling
    // back to the bare functionName. Fire-and-forget — slow eth.sh / ENS
    // lookups must not block the broadcast loop.
    attachClearSignedMetaToHistory(
      txId,
      { ...entry.tx, to: entry.tx.to ?? undefined },
      chainId,
    );

    prepared.push({ txId, pending, nonce, functionName: entry.functionName, swapMeta: entry.swapMeta });
  }

  // Phase 2 (ordered): broadcast nonce N+1 only after nonce N is accepted.
  // This avoids stranded higher-nonce swap legs executing later if an earlier
  // approval/bridge leg fails before it reaches the mempool.
  // gasEstimates[i] aligns with prepared[i] because we built `prepared`
  // by iterating `transactions` in order — same indexing the UI used.
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    const gasOverride = gasEstimates?.[i];
    const result = await broadcastSwapTxLocal(
      item.txId,
      item.pending,
      account,
      privateKey,
      item.nonce,
      rpcUrl,
      customChainMeta,
      gasOverride
        ? {
            gasLimit: gasOverride.gasLimit,
            maxFeePerGas: gasOverride.maxFeePerGas,
            maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
          }
        : undefined,
    );
    if (!result.success) {
      const skippedError =
        "Skipped because an earlier swap transaction failed to broadcast";
      for (const skipped of prepared.slice(i + 1)) {
        await updateTxInHistory(skipped.txId, {
          status: "failed",
          error: skippedError,
          completedAt: Date.now(),
        });
      }
      return {
        // If earlier legs already reached the mempool, close the swap flow and
        // let Activity/notifications surface the partial failure. Keeping the
        // confirmation open would invite a duplicate retry against new nonces.
        success: i > 0,
        txIds,
        error: `Transaction ${i + 1}/${prepared.length} failed to broadcast: ${
          result.error || "Unknown error"
        }`,
      };
    }
    if (result.broadcastUncertain) {
      const skippedError =
        "Skipped because the previous transaction's broadcast is still unconfirmed";
      for (const skipped of prepared.slice(i + 1)) {
        await updateTxInHistory(skipped.txId, {
          status: "failed",
          error: skippedError,
          completedAt: Date.now(),
        });
      }
      // The current deterministic hash is retained and polled. Closing the
      // flow avoids both a duplicate retry and unsafe higher-nonce tail sends.
      return { success: true, txIds };
    }
  }

  return { success: true, txIds };
}

type BankrSwapLegResult =
  | { kind: "accepted"; txHash: string }
  | { kind: "reverted" | "failed" | "ambiguous"; error: string };

/** Sign+broadcast one swap tx via Bankr API and report a definitive leg state. */
async function processSwapTxBankr(
  txId: string,
  pending: PinnedTxRequest,
  apiKey: string,
  functionName?: string,
  swapMeta?: SwapMeta,
  bridge?: import("./txHistoryStorage").BridgeMeta,
  effectLease?: PendingRequestEffectLease,
): Promise<BankrSwapLegResult> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.tx.chainId,
    createdAt: pending.timestamp,
    accountType: "bankr",
    functionName,
    swapMeta,
    bridge,
  });

  // Snapshot the clear-signed summary so internal swap/bridge approve calls
  // ("Approved 500 USDC to SocketGateway") render the same human-readable
  // line as dapp-initiated approves. Fire-and-forget.
  attachClearSignedMetaToHistory(
    txId,
    { ...pending.tx, to: pending.tx.to ?? undefined },
    pending.tx.chainId,
  );

    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      // Save txHash before marking as failed so explorer link works
      if (txHash) await updateTxInHistory(txId, { txHash });
      await handleTransactionFailure(txId, pending, "Transaction reverted onchain");
      return { kind: "reverted", error: "Transaction reverted onchain" };
    } else if (result.status === "success" && txHash) {
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId,
        txHash,
        chainId: pending.tx.chainId,
        userAddress: pending.tx.from,
        logPrefix: "[bankr-swap]",
      });
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      // Cross-chain bridge: kick off destination polling for entries that
      // carry bridge meta. No-op for plain swaps.
      if (bridge) {
        try {
          const { maybeStartBridgePolling } = await import("./bridgeStatusPoller");
          await maybeStartBridgePolling(txId);
        } catch (err) {
          console.warn("[bridge] failed to start status polling", err);
        }
      }
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
      if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
    }
    return { kind: "accepted", txHash };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (error instanceof BankrApiError && error.outcomeUncertain) {
      await updateTxInHistory(txId, {
        status: "pending",
        error: errorMessage,
        broadcastUncertain: true,
      });
      return { kind: "ambiguous", error: errorMessage };
    }
    effectGuard.settleEffect();
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
    return { kind: "failed", error: errorMessage };
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
  }
}

/**
 * Sign and broadcast one swap tx with a pre-assigned nonce.
 * History entry must already exist (created in the preparation phase).
 */
async function broadcastSwapTxLocal(
  txId: string,
  pending: PinnedTxRequest,
  account: Account,
  privateKey: `0x${string}`,
  nonce: number,
  rpcUrl?: string,
  customChainMeta?: { name: string; nativeCurrency?: { name: string; symbol: string; decimals: number }; explorer?: string },
  gasOverrides?: GasOverrides,
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  broadcastUncertain?: boolean;
}> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    // Apply tier-picker / Custom-tier overrides if the UI passed them in.
    // Clears legacy gasPrice the same way processLocalTransactionInBackground
    // does, to avoid an EIP-1559 / legacy field conflict at signing time.
    const txForSigning = gasOverrides
      ? {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
        };

    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
      customChainMeta,
      () => assertLocalAccountEffectBinding(account),
    );
    const txHash = result.txHash;

    if (txHash) {
      if (result.receipt) {
        // Sync-send path (e.g., MegaETH): receipt arrived with the broadcast,
        // so skip the intermediate "pending" write and jump straight to the
        // final state. Otherwise the UI would briefly flash pending → success.
        await applyReceiptToHistory(txId, txHash, pending.tx.chainId, result.receipt, {
          rpcUrl,
          signedGasLimit: result.signedGasLimit,
        });
      } else {
        await updateTxInHistory(txId, {
          status: "pending",
          txHash,
          broadcastUncertain: result.broadcastUncertain === true,
        });
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }
    } else {
      await updateTxInHistory(txId, {
        status: "pending",
        txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
    }
    return {
      success: true,
      txHash,
      broadcastUncertain: isBroadcastOutcomeUncertain(result),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
    return { success: false, error: errorMessage };
  } finally {
    activeAbortControllers.delete(txId);
  }
}

// ---------------------------------------------------------------------------
// Batched Swap Execution (Bankr accounts: approve+swap as single ERC-7821 tx)
// ---------------------------------------------------------------------------

/**
 * Submits a batched swap transaction (approval + swap encoded as single ERC-7821
 * batch) via the Bankr API. Only for Bankr/impersonator accounts.
 */
export async function handleExecuteSwapBatch(
  batchTx: { to: string; data: string; value: string },
  originalTransactions: SwapTxEntry[],
  chainId: number,
  chainName: string,
  accountLock?: SwapAccountLock,
): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  if (originalTransactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  // Validate chain
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return { success: false, error: `Chain not supported for Bankr API accounts` };
  }

  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) {
    return { success: false, error: locked.error };
  }
  const validation = validateLockedSwapTransactions(
    originalTransactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const account = locked.account;
  // SECURITY: impersonator accounts are view-only — block all swap execution.
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot execute swaps" };
  }
  if (account.type !== "bankr") {
    return { success: false, error: "Batch swap requires a Bankr account" };
  }

  let apiKey = getCachedApiKey();
  if (!apiKey) {
    if (!getCachedPassword()) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        await tryRestoreSession(handleUnlockWallet);
        apiKey = getCachedApiKey();
      }
    }
    if (!apiKey) {
      return { success: false, error: "Wallet must be unlocked" };
    }
  }

  const txId = crypto.randomUUID();
  const fromAddress = account.address;

  // Build combined function name and extract swapMeta from original txs
  const functionNames = originalTransactions
    .map((t) => t.functionName || t.origin)
    .join(", ");
  const swapMeta = originalTransactions.find((t) => t.swapMeta)?.swapMeta;
  // For cross-chain batches, the bridge meta is attached to the bridge call
  // (typically the last entry). Carry it onto the wrapping ERC-7821 tx so
  // status polling kicks off when the batch tx confirms onchain.
  const bridge = originalTransactions.find((t) => t.bridge)?.bridge;
  // The activity tab + tx-detail modal both branch on `origin` containing
  // " → " to render the rich bridge UI. Use the bridge/swap entry's origin
  // (e.g. "Bridge USDC → Arbitrum") instead of a generic "Batch: …" prefix
  // so batched bridges render the same as their sequential counterparts.
  const mainEntry =
    originalTransactions.find((t) => t.bridge) ??
    originalTransactions.find((t) => t.swapMeta) ??
    originalTransactions[0];

  // Pre-estimate gas for the outer ERC-7821 batch tx and forward it to Bankr.
  // Bankr's server-side estimator underestimates Universal Router / V4-hook
  // calls (the ETH↔WCHAN custom route in particular) which OOGs onchain. We
  // run eth_estimateGas locally with a 50% buffer so the user pays for actual
  // observed cost on Base (unused gas refunds, so over-budgeting is safe).
  const { estimateGasLimitWithBuffer } = await import("./gasEstimation");
  const buffered = await estimateGasLimitWithBuffer(
    {
      from: fromAddress,
      to: batchTx.to,
      data: batchTx.data,
      value: batchTx.value,
      chainId,
    },
    50,
  );

  const batchTxParams: TransactionParams = {
    from: fromAddress,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId,
    ...(buffered ? { gas: buffered.toString() } : {}),
  };

  const pending = await bindPendingBankrCredential(pinnedTxRequest(account, {
    id: txId,
    tx: batchTxParams,
    origin: mainEntry?.origin ?? `Batch: ${functionNames}`,
    favicon: mainEntry?.favicon ?? originalTransactions[0]?.favicon ?? null,
    chainName,
    timestamp: Date.now(),
    trustedInternal: true,
  }));

  const effectLease = beginPendingRequestEffectLease(
    "internalOperation",
    txId,
  );
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }

  // Fire-and-forget: the lease remains owned by the background processor after
  // this handler returns its tx id to the confirmation surface.
  void processSwapTxBankr(
    txId,
    pending,
    apiKey,
    `Batch: ${functionNames}`,
    swapMeta,
    bridge,
    effectLease,
  );

  return { success: true, txIds: [txId] };
}

/**
 * PK/Seed atomic swap submission via EIP-7702 + ERC-7821.
 *
 * Mirror of `handleExecuteSwapBatch` for self-custody accounts: the same
 * `[approve, swap]` (or `[approve, bridge]`) sequence ships as a single
 * onchain tx via the type-4 path used by `wallet_sendCalls`, so the user
 * gets the same one-hash atomicity Bankr accounts get on supported chains.
 *
 * Eligibility is decided on the SwapView side via `getDelegationStatus`;
 * if the resolver here returns no delegate, we error out so the caller can
 * fall back to the sequential `executeSwapDirect` path.
 */
export async function handleExecuteSwapAtomicPK(args: {
  originalTransactions: SwapTxEntry[];
  chainId: number;
  chainName: string;
  accountLock?: SwapAccountLock;
  gasOverrides?: {
    gasLimit: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
}): Promise<{ success: boolean; txIds?: string[]; error?: string }> {
  const {
    originalTransactions,
    chainId,
    chainName,
    accountLock,
    gasOverrides,
  } = args;
  if (originalTransactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }

  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) {
    return { success: false, error: locked.error };
  }
  const validation = validateLockedSwapTransactions(
    originalTransactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const account = locked.account;
  if (account.type === "impersonator") {
    return { success: false, error: "View-only accounts cannot execute swaps" };
  }
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error: "Atomic-7702 swap requires a PK or Seed Phrase account",
    };
  }

  // Mirror of the PK/SP unlock pattern in handleExecuteSwapDirect — relies on
  // cached vault / session restoration only. The swap entry points always
  // operate on a logged-in user; if the cache is empty we surface "Wallet
  // must be unlocked" so the UI can prompt rather than silently failing.
  let privateKey = getPrivateKeyFromCache(account.id);
  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) privateKey = getPrivateKeyFromCache(account.id);
      }
    }
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        const vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
        if (vault) setCachedVault(vault);
      }
      privateKey = getPrivateKeyFromCache(account.id);
    }
    if (!privateKey) {
      return { success: false, error: "Wallet must be unlocked" };
    }
  }

  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }

  // Resolve the active delegate. If nothing usable, refuse — SwapView will
  // fall back to the sequential `executeSwapDirect` path. Don't silently
  // downgrade to auto-sequential here; the caller (and the user) already
  // committed to atomic by reaching this handler.
  const { resolveActiveDelegate } = await import(
    "../utils/delegationResolution"
  );
  const resolution = await resolveActiveDelegate({
    accountId: account.id,
    accountAddress: account.address as `0x${string}`,
    chainId,
    rpcUrl: resolved.rpcUrl,
  });
  if (!resolution.delegate) {
    return {
      success: false,
      error:
        "No EIP-7702 delegate available for this account on this chain. Configure a custom delegate in Account Settings or switch chains.",
    };
  }

  // Build the synthetic batch: each prepared tx becomes one inner ERC-5792
  // call. The handler reads `params.calls` and encodes them via
  // `encodeBatchCalls(calls, EOA)` — same call shape as dapp-initiated
  // `wallet_sendCalls`.
  const calls = originalTransactions.map((t) => ({
    to: (t.tx.to ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    data: (t.tx.data ?? "0x") as `0x${string}`,
    value: (t.tx.value ?? "0x0") as `0x${string}`,
  }));

  // History metadata: swapMeta lives on one of the inner txs (typically the
  // swap, not the approve); bridge lives on the last entry for cross-chain
  // routes. Same extraction rule as `handleExecuteSwapBatch` so the activity
  // modal renders consistently regardless of account type.
  const swapMeta = originalTransactions.find((t) => t.swapMeta)?.swapMeta;
  const bridge = originalTransactions.find((t) => t.bridge)?.bridge;
  // Pick the bridge/swap entry's origin (e.g. "Bridge USDC → Arbitrum" or
  // "Swap USDC to ETH") so the activity row renders the same rich UI as
  // sequential bridges — two-line "Bridge X / → Chain" title, overlapping
  // sell/buy token icons, "Bridging to …" status. Falling back to the first
  // entry would surface the approval's "Approve USDC for bridge" instead.
  const mainEntry =
    originalTransactions.find((t) => t.bridge) ??
    originalTransactions.find((t) => t.swapMeta) ??
    originalTransactions[0];
  const functionNames = originalTransactions
    .map((t) => t.functionName || t.origin)
    .filter(Boolean) as string[];

  const bundleId = crypto.randomUUID();
  const { pinnedBatchTxRequest } = await import("./pinnedRequest");
  const pending = pinnedBatchTxRequest(account, {
    id: bundleId,
    params: {
      version: "1.0",
      chainId: `0x${chainId.toString(16)}` as `0x${string}`,
      from: account.address as `0x${string}`,
      calls,
    },
    origin: mainEntry?.origin ?? "swap",
    favicon: mainEntry?.favicon ?? originalTransactions[0]?.favicon ?? null,
    chainName,
    chainId,
    timestamp: Date.now(),
    trustedInternal: true,
  });

  // Synthesize the same single wrapped estimate shape that the atomic-7702
  // confirmation UI emits for dapp batches. The broadcaster uses this gas
  // limit exactly, so the values shown/edited by the user are the values signed.
  const precomputedGasEstimates = gasOverrides
    ? [
        {
          gasLimit: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          baseFee: "0",
          estimatedCostWei: "0",
          nativePriceUsd: null,
          nativeCurrencySymbol: "",
          accountBalance: "0",
          insufficientBalance: false,
          estimationFailed: false,
          dappProvidedGas: false,
        },
      ]
    : undefined;

  const { processBatchTransactionAtomic7702InBackground } = await import(
    "./batchTxHandlers"
  );
  const effectLease = beginPendingRequestEffectLease(
    "internalOperation",
    bundleId,
  );
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }
  void processBatchTransactionAtomic7702InBackground(
    bundleId,
    pending,
    { id: account.id, address: account.address, type: account.type },
    privateKey,
    resolution.delegate,
    resolution.needsAuthorization,
    functionNames.length ? functionNames : undefined,
    precomputedGasEstimates,
    { swapMeta, bridge },
    effectLease,
  );

  return { success: true, txIds: [bundleId] };
}

/**
 * Cancels a processing transaction by aborting the in-flight request.
 */
export async function handleCancelProcessingTx(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const controller = activeAbortControllers.get(txId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(txId);
  }

  // Update history regardless (may already have been marked failed by the abort handler)
  const tx = await getTxById(txId);
  if (tx && tx.status === "processing") {
    await updateTxInHistory(txId, {
      status: "failed",
      error: "Cancelled by user",
      completedAt: Date.now(),
    });
  }

  return { success: true };
}
